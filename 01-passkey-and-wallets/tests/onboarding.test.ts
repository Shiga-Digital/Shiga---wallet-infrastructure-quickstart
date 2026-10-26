import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { type Api, HttpError } from '../server/api.js';
import { customerFixture } from './authenticator.js';

let fixture: ReturnType<typeof customerFixture>;
let store: Store;
beforeEach(() => { fixture = customerFixture(); store = new Store(':memory:'); });
afterEach(() => { store.close(); fixture.cleanup(); });

function setup() {
  const api = vi.fn<Api>(async path => {
    if (path === '/v1/customers') return { id: 'c1' };
    if (path === '/v1/wallets/provision') return { wallets: fixture.context.wallets, passkeyPublicKey: fixture.auth.coordinates };
    throw new Error('Unexpected API request: ' + path);
  });
  const { app } = createApp(fixture.config, store, api);
  const agent = request.agent(app);
  const post = (path: string) => agent.post(path).set('Host', 'localhost:3000').set('Origin', fixture.config.origin);
  return { api, app, agent, post };
}

describe('verified registration to wallet provisioning', () => {
  it('verifies an actual ES256 WebAuthn registration and forwards its COSE bytes', async () => {
    const { post, api, agent } = setup();
    expect((await post('/api/customers').send({ reference: 'partner-1' })).status).toBe(201);
    const options = await post('/api/passkeys/options').send({});
    expect(options.body.pubKeyCredParams).toEqual([{ alg: -7, type: 'public-key' }]);
    expect(options.body.authenticatorSelection.userVerification).toBe('required');
    expect(JSON.stringify(store.db.prepare('SELECT payload FROM sessions').all())).not.toContain(options.body.challenge);
    const registered = await post('/api/passkeys/register').send(fixture.auth.register(options.body.challenge));
    expect(registered.status).toBe(201);
    expect(api).toHaveBeenLastCalledWith('/v1/wallets/provision', { method: 'POST', customerId: 'c1', body: { passkeyRegistration: { credentialId: fixture.auth.metadata.id, credentialPublicKey: fixture.auth.metadata.publicKey, rpId: 'localhost', origins: [fixture.config.origin] } } });
    const exported = await agent.get('/api/customer-context').set('Host', 'localhost:3000');
    expect(exported.body.credential.publicKey).toBe(fixture.auth.metadata.publicKey);
    expect(JSON.stringify(exported.body)).not.toContain(fixture.config.apiKey);
    expect((await post('/api/passkeys/register').send(fixture.auth.register(options.body.challenge))).status).toBe(409);
  });
  it.each(['wrong-origin', 'wrong-challenge', 'no-user-verification'])('rejects %s before provisioning', async kind => {
    const { post, api } = setup();
    await post('/api/customers').send({ reference: 'partner-1' });
    const options = await post('/api/passkeys/options').send({});
    const response = fixture.auth.register(kind === 'wrong-challenge' ? 'different-challenge' : options.body.challenge, kind === 'wrong-origin' ? 'http://evil.localhost:3000' : fixture.config.origin, kind !== 'no-user-verification');
    expect((await post('/api/passkeys/register').send(response)).status).toBe(400);
    expect(api.mock.calls.filter(([path]) => path === '/v1/wallets/provision')).toHaveLength(0);
  });
  it('retains the verified credential when provisioning fails so retry needs no new passkey', async () => {
    const { post, api } = setup();
    await post('/api/customers').send({ reference: 'partner-1' });
    const options = await post('/api/passkeys/options').send({});
    api.mockRejectedValueOnce(new HttpError(502, 'upstream_unavailable', 'Temporary outage'));
    expect((await post('/api/passkeys/register').send(fixture.auth.register(options.body.challenge))).status).toBe(502);
    expect((await post('/api/wallets/provision').send({})).status).toBe(200);
  });
  it('blocks cross-origin and missing-origin writes, host rebinding and cross-session state reads', async () => {
    const { app, post, agent } = setup();
    expect((await request(app).post('/api/customers').set('Host', 'localhost:3000').send({ reference: 'x' })).status).toBe(403);
    expect((await request(app).post('/api/customers').set('Host', 'localhost:3000').set('Origin', 'https://attacker.example').send({ reference: 'x' })).status).toBe(403);
    expect((await request(app).get('/api/state').set('Host', 'attacker.example')).status).toBe(403);
    await post('/api/customers').send({ reference: 'partner-1' });
    expect((await request(app).get('/api/state').set('Host', 'localhost:3000')).body.customerId).toBeUndefined();
    const state = await agent.get('/api/state').set('Host', 'localhost:3000');
    expect(state.body.customerId).toBe('c1');
    expect(JSON.stringify(state.body)).not.toContain(fixture.config.apiKey);
  });
  it('serves the locally installed browser bundle and the plain browser page', async () => {
    const { app } = setup();
    expect((await request(app).get('/').set('Host', 'localhost:3000')).text).toContain('Register passkey');
    const bundle = await request(app).get('/vendor/simplewebauthn.js').set('Host', 'localhost:3000');
    expect(bundle.status).toBe(200);
    expect(bundle.text).toContain('startRegistration');
    expect(bundle.headers['content-security-policy']).toContain("script-src 'self'");
  });
});
