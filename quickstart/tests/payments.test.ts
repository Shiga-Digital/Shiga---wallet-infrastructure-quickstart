import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { dirname, join } from 'node:path';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { type Api, HttpError } from '../server/api.js';
import { hashToChallenge } from '../server/evm.js';
import { hashToChallenge as browserChallenge } from '../web/approve.js';
import { transactionChallenge } from '../server/other-networks.js';
import { authenticator, customerFixture } from './authenticator.js';

let fixture: ReturnType<typeof customerFixture>;
let store: Store;
const hash = '0x' + 'a3'.repeat(32);
const intent = { moduleId: 'evm_erc4337', chain: 'base', token: 'usdt', amount: '0.01', recipientAddress: '0x' + '34'.repeat(20) };
beforeEach(() => { fixture = customerFixture(); store = new Store(':memory:'); });
afterEach(() => { vi.restoreAllMocks(); store.close(); fixture.cleanup(); });

function setup() {
  const api = vi.fn<Api>(async path => {
    if (path === '/v1/quotes') return { gas: '0.001', userCost: '0.001', maxSendable: '1' };
    if (path === '/v1/userops/prepare') return { userOpHash: hash, threshold: 1 };
    if (path.endsWith('/signatures')) return { userOpHash: hash, status: 'signed', collected: 1, threshold: 1 };
    if (path === '/v1/transactions') return { chain: 'bitcoin', transactionHash: 'transaction-1' };
    if (path.startsWith('/v1/transactions?')) return { items: [] };
    throw new Error('Unexpected API call: ' + path);
  });
  const created = store.newSession();
  store.saveSession(created.id, { ...fixture.context });
  const { app } = createApp(fixture.config, store, api);
  const post = (path: string) => request(app).post(path).set('Host', 'localhost:3000').set('Origin', fixture.config.origin).set('Cookie', 'shiga_3000=' + created.token);
  const get = (path: string) => request(app).get(path).set('Host', 'localhost:3000').set('Cookie', 'shiga_3000=' + created.token);
  const prepare = async (body: object = intent) => {
    const quote = await post('/api/payments/quote').send(body);
    expect(quote.status).toBe(200);
    const response = await post('/api/payments/prepare').send({ quoteId: quote.body.id });
    expect(response.status).toBe(200);
    return response.body;
  };
  return { api, post, get, prepare, created };
}

describe('payment approval and settlement boundaries', () => {
  it('quotes without a sender, prepares the stored Safe and submits an actual signed assertion', async () => {
    const { prepare, post, api, get } = setup();
    const prepared = await prepare();
    expect(api.mock.calls[0]).toEqual(['/v1/quotes', { method: 'POST', customerId: 'c1', body: { moduleId: 'evm_erc4337', txParams: { chain: 'base', token: 'usdt', amount: '0.01', recipientAddress: intent.recipientAddress } } }]);
    expect(api.mock.calls[1][1]?.body).toMatchObject({ safeAddress: fixture.context.wallets[0].address, passkeyPublicKey: fixture.auth.coordinates, to: intent.recipientAddress, amount: '0.01' });
    expect(prepared.options.challenge).toBe(Buffer.from(hash.slice(2), 'hex').toString('base64url'));
    const assertion = fixture.auth.approve(prepared.options.challenge);
    const approved = await post('/api/payments/approve').send({ paymentId: prepared.paymentId, assertion });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('submitted');
    expect(api).toHaveBeenLastCalledWith('/v1/userops/' + hash + '/signatures', expect.objectContaining({ customerId: 'c1', body: expect.objectContaining({ passkeyPublicKey: fixture.auth.coordinates, passkeyData: expect.objectContaining({ credential: assertion, expectedChallenge: prepared.options.challenge, expectedOrigins: [fixture.config.origin], expectedRPID: 'localhost' }) }) }));
    const status = await get('/api/payments/status');
    expect(status.body.status).toBe('pending');
    expect(status.body.message).toContain('Only confirmed');
    expect((await post('/api/payments/approve').send({ paymentId: prepared.paymentId, assertion })).status).toBe(409);
  });
  it.each(['wrong-challenge', 'wrong-origin', 'different-credential', 'mutated-body'])('refuses %s without submitting', async kind => {
    const { prepare, post, api } = setup();
    const prepared = await prepare();
    const assertion = kind === 'different-credential' ? authenticator().approve(prepared.options.challenge) : fixture.auth.approve(kind === 'wrong-challenge' ? 'wrong-challenge' : prepared.options.challenge, kind === 'wrong-origin' ? 'https://evil.example' : fixture.config.origin);
    const response = await post('/api/payments/approve').send({ paymentId: prepared.paymentId, assertion, ...(kind === 'mutated-body' ? { amount: '1000' } : {}) });
    expect([400, 409]).toContain(response.status);
    expect(api.mock.calls.filter(([path]) => path.endsWith('/signatures'))).toHaveLength(0);
  });
  it('consumes an approval once under concurrent requests', async () => {
    const { prepare, post, api } = setup();
    const prepared = await prepare();
    const body = { paymentId: prepared.paymentId, assertion: fixture.auth.approve(prepared.options.challenge) };
    const responses = await Promise.all([post('/api/payments/approve').send(body), post('/api/payments/approve').send(body)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect(api.mock.calls.filter(([path]) => path.endsWith('/signatures'))).toHaveLength(1);
  });
  it('keeps uncertain submissions blocked until a confirmed transaction is found, including pagination', async () => {
    const { prepare, post, get, api } = setup();
    const prepared = await prepare();
    api.mockRejectedValueOnce(new HttpError(502, 'upstream_unavailable', 'Timeout'));
    expect((await post('/api/payments/approve').send({ paymentId: prepared.paymentId, assertion: fixture.auth.approve(prepared.options.challenge) })).status).toBe(502);
    const quote = await post('/api/payments/quote').send(intent);
    expect((await post('/api/payments/prepare').send({ quoteId: quote.body.id })).body.error).toBe('outcome_unknown');
    api.mockResolvedValueOnce({ items: [{ customerId: 'somebody-else', reference: hash, status: 'confirmed' }], nextCursor: 'page-2' });
    api.mockResolvedValueOnce({ items: [{ customerId: 'c1', reference: hash, status: 'confirmed', transactionHash: 'tx-confirmed' }] });
    const status = await get('/api/payments/status');
    expect(status.body.status).toBe('confirmed');
    expect(api.mock.calls.at(-1)?.[0]).toContain('cursor=page-2');
    const newQuote = await post('/api/payments/quote').send(intent);
    expect((await post('/api/payments/prepare').send({ quoteId: newQuote.body.id })).status).toBe(200);
  });
  it('binds non-EVM submissions to the wallet and a stable, generated transactionId', async () => {
    const { prepare, post, api } = setup();
    const prepared = await prepare({ moduleId: 'bitcoin', chain: 'bitcoin', token: 'BTC', amount: '0.00001', recipientAddress: 'bc1qexample' });
    const approved = await post('/api/payments/approve').send({ paymentId: prepared.paymentId, assertion: fixture.auth.approve(prepared.options.challenge) });
    expect(approved.status).toBe(200);
    const body = api.mock.calls.at(-1)?.[1]?.body as { moduleId: string; txParams: Record<string, unknown> };
    expect(Number.isSafeInteger(body.txParams.transactionId)).toBe(true);
    expect(Number(body.txParams.transactionId)).toBeGreaterThan(1_000_000_000_000);
    expect(body.txParams.accountIndex).toBeUndefined();
    expect(prepared.options.challenge).toBe(transactionChallenge('biz:b1:proj:p1:cust:c1', 'bitcoin', body.txParams));
  });
  it('does not resolve a failed but undetermined outcome into permission to resubmit', async () => {
    const { prepare, post, get, api } = setup();
    const prepared = await prepare();
    api.mockRejectedValueOnce(new HttpError(502, 'upstream_unavailable', 'Timeout'));
    await post('/api/payments/approve').send({ paymentId: prepared.paymentId, assertion: fixture.auth.approve(prepared.options.challenge) });
    api.mockResolvedValueOnce({ items: [{ customerId: 'c1', reference: hash, status: 'failed', outcomeUndetermined: true }] });
    expect((await get('/api/payments/status')).body.transaction.outcomeUndetermined).toBe(true);
    const quote = await post('/api/payments/quote').send(intent);
    expect((await post('/api/payments/prepare').send({ quoteId: quote.body.id })).status).toBe(409);
  });
});

describe('challenge compatibility with main', () => {
  it('matches the enclave wallet-binding vector', () => {
    expect(transactionChallenge('biz:b1:proj:p1:cust:c1', 'solana', { chain: 'solana', amount: '5', recipientAddress: 'SA', selectedPayment: 'paymaster', networkConfig: { rpcUrl: 'https://rpc', tokenMint: 'MintA', paymasterUrl: 'https://kora', paymasterAddress: 'PayAddr', paymasterToken: { address: 'USDT' } } })).toBe('oGkf9t9XJAIZpNvJIu6YVlF0esqYviibTmBmyYnHtkQ');
  });
  it('matches browser and server encoding of all 32 hash bytes and rejects text/non-hex hashes', () => {
    expect(browserChallenge(hash)).toBe(hashToChallenge(hash));
    expect(hashToChallenge(hash)).not.toBe(Buffer.from(hash).toString('base64url'));
    for (const invalid of ['', '0x123', '0x' + 'gg'.repeat(32)]) { expect(() => hashToChallenge(invalid)).toThrow(); expect(() => browserChallenge(invalid)).toThrow(); }
  });
});


describe('review regressions', () => {
  it('refuses a late quote snapshot instead of erasing an uncertain approval', async () => {
    const { prepare, post, api, created } = setup();
    const prepared = await prepare();
    let release!: () => void;
    let announce!: () => void;
    const started = new Promise<void>(resolve => { announce = resolve; });
    const delayed = new Promise<unknown>(resolve => { release = () => resolve({ gas: '0.001' }); });
    api.mockImplementationOnce(async () => { announce(); return delayed; });
    const late = post('/api/payments/quote').send(intent).then(response => response);
    await started;
    api.mockRejectedValueOnce(new HttpError(502, 'upstream_unavailable', 'Timeout'));
    expect((await post('/api/payments/approve').send({ paymentId: prepared.paymentId, assertion: fixture.auth.approve(prepared.options.challenge) })).status).toBe(502);
    release();
    expect((await late).status).toBe(409);
    expect(store.readSession(created.id)).toMatchObject({ pending: { state: 'uncertain' } });
    const quote = await post('/api/payments/quote').send(intent);
    expect((await post('/api/payments/prepare').send({ quoteId: quote.body.id })).body.error).toBe('outcome_unknown');
  });
  it('uses the same custom asset selector for the quote, display and signed intent', async () => {
    const { prepare, api } = setup();
    const prepared = await prepare({ moduleId: 'solana', chain: 'solana', token: 'usdt', tokenMint: 'CustomMintAddress', amount: '1', recipientAddress: 'SolanaRecipient' });
    expect(api.mock.calls[0][1]?.body).toMatchObject({ txParams: { token: 'CustomMintAddress' } });
    expect(prepared.intent.token).toBe('CustomMintAddress');
    const current = store.db.prepare('SELECT payload FROM sessions').get();
    const data = JSON.parse(String(current?.payload));
    expect(data.pending.txParams.networkConfig).toEqual({ tokenMint: 'CustomMintAddress' });
  });
  it.each([
    { moduleId: 'solana', chain: 'solana', token: 'CustomMintAddress' },
    { moduleId: 'solana', chain: 'solana', token: 'DifferentMint', tokenMint: 'CustomMintAddress' },
    { moduleId: 'bitcoin', chain: 'bitcoin', token: 'BTC', tokenMint: 'CustomMintAddress' },
    { moduleId: 'tron', chain: 'tron', token: 'CustomContract' },
  ])('rejects inconsistent or unsupported asset selection %j', async asset => {
    const { post, api } = setup();
    expect((await post('/api/payments/quote').send({ ...asset, amount: '1', recipientAddress: 'recipient' })).status).toBe(400);
    expect(api).not.toHaveBeenCalled();
  });
});


it('blocks session mutations while crypto verification is in flight without stranding the original approval', async () => {
  const { prepare, post, get, api, created } = setup();
  const prepared = await prepare();
  let announce!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { announce = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const realVerify = globalThis.crypto.subtle.verify.bind(globalThis.crypto.subtle);
  vi.spyOn(globalThis.crypto.subtle, 'verify').mockImplementationOnce(async (...args) => { announce(); await gate; return realVerify(...args); });
  const approval = post('/api/payments/approve').send({ paymentId: prepared.paymentId, assertion: fixture.auth.approve(prepared.options.challenge) }).then(response => response);
  await started;
  try {
    const before = store.db.prepare('SELECT revision FROM sessions WHERE id = ?').get(created.id)?.revision;
    for (const route of ['/api/payments/quote', '/api/wallets/provision', '/api/passkeys/register']) {
      const response = await post(route).send(intent);
      expect(response.status).toBe(409);
      expect(response.body.error).toBe('approval_in_progress');
    }
    api.mockResolvedValueOnce({ items: [{ customerId: 'c1', reference: hash, status: 'confirmed' }] });
    expect((await get('/api/payments/status')).body.status).toBe('confirmed');
    expect(store.db.prepare('SELECT revision FROM sessions WHERE id = ?').get(created.id)?.revision).toBe(before);
  } finally { release(); }
  expect((await approval).status).toBe(200);
  expect(api.mock.calls.filter(([path]) => path.endsWith('/signatures'))).toHaveLength(1);
  expect(store.readSession(created.id)).toMatchObject({ pending: { state: 'submitted' } });
});

it('accepts the documented USD token symbol and normalizes it to the same default signed asset', async () => {
  const { prepare } = setup();
  const prepared = await prepare({ moduleId: 'tron', chain: 'tron', token: 'USD\u20ae', amount: '1', recipientAddress: 'TronRecipient' });
  expect(prepared.intent.token).toBe('usdt');
});


it('recovers an interrupted durable submitting state after restart and unlocks only after confirmed reconciliation', async () => {
  const file = join(dirname(fixture.config.contextFile!), 'runtime.sqlite');
  store.close(); store = new Store(file);
  const { prepare, api, created } = setup();
  await prepare();
  const persisted = store.readSession(created.id) as { pending: { state: string } };
  persisted.pending.state = 'submitting';
  store.saveSession(created.id, persisted);
  store.close(); store = new Store(file);
  const { app } = createApp(fixture.config, store, api);
  const post = (path: string) => request(app).post(path).set('Host', 'localhost:3000').set('Origin', fixture.config.origin).set('Cookie', 'shiga_3000=' + created.token);
  const firstQuote = await post('/api/payments/quote').send(intent);
  expect(firstQuote.status).toBe(200);
  expect((await post('/api/payments/prepare').send({ quoteId: firstQuote.body.id })).body.error).toBe('outcome_unknown');
  api.mockResolvedValueOnce({ items: [{ customerId: 'c1', reference: hash, status: 'confirmed' }] });
  const status = await request(app).get('/api/payments/status').set('Host', 'localhost:3000').set('Cookie', 'shiga_3000=' + created.token);
  expect(status.body.status).toBe('confirmed');
  expect(store.readSession(created.id)).toMatchObject({ pending: { state: 'confirmed' } });
  const nextQuote = await post('/api/payments/quote').send(intent);
  expect((await post('/api/payments/prepare').send({ quoteId: nextQuote.body.id })).status).toBe(200);
});
