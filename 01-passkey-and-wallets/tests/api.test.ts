import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi, HttpError } from '../server/api.js';
import type { Config } from '../server/config.js';
import { Store, digest } from '../server/store.js';

export const config: Config = { apiUrl: 'https://api.pilot.shiga.io', apiKey: 'sk_test_fixture_only', webhookSecret: 'fixture-webhook-signing-key', port: 3000, origin: 'http://localhost:3000', rpId: 'localhost', databasePath: ':memory:', businessId: 'b1', projectId: 'p1' };

afterEach(() => vi.restoreAllMocks());
describe('HTTP API boundary', () => {
  it('keeps the key in outbound server headers and unwraps the actual envelope', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: true, status: 201, data: { id: 'customer-1' } }, { status: 201 }));
    const api = createApi(config, fetcher);
    await expect(api('/v1/customers', { method: 'POST', body: { reference: 'partner-1' }, customerId: 'c1', idempotencyKey: 'stable-1' })).resolves.toEqual({ id: 'customer-1' });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.pilot.shiga.io/v1/customers');
    expect(options?.headers).toEqual({ Authorization: 'Bearer sk_test_fixture_only', Accept: 'application/json', 'Content-Type': 'application/json', 'x-customer-id': 'c1', 'Idempotency-Key': 'stable-1' });
    expect(options?.body).toBe('{"reference":"partner-1"}');
    expect(options?.redirect).toBe('error');
  });
  it('does not expose upstream detail or echo secrets in errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: false, data: { code: 'validation_failed', detail: config.apiKey, request_id: 'request-42' } }, { status: 400 }));
    const error = await createApi(config, fetcher)('/v1/quotes').catch(error => error as HttpError);
    expect(error).toMatchObject({ status: 400, code: 'validation_failed', requestId: 'request-42' });
    expect(JSON.stringify(error)).not.toContain(config.apiKey);
  });
  it('does not automatically retry a write when its network outcome is unknown', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('socket timeout'));
    await expect(createApi(config, fetcher)('/v1/transactions', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 502, code: 'upstream_unavailable' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed API envelopes and external paths', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'not-an-envelope' }));
    await expect(createApi(config, fetcher)('/v1/customers')).rejects.toMatchObject({ code: 'invalid_upstream_response' });
    await expect(createApi(config, fetcher)('https://other.example/steal')).rejects.toThrow('Invalid API path');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('durable sample storage', () => {
  it('persists only hashes of session tokens and expires sessions', () => {
    const store = new Store(':memory:');
    try {
      const created = store.newSession();
      expect(created.id).toBe(digest(created.token));
      expect(store.db.prepare('SELECT id, payload FROM sessions').get()).toEqual({ id: created.id, payload: '{}' });
      store.saveSession(created.id, { customerId: 'c1' });
      expect(store.readSession(created.id)).toEqual({ customerId: 'c1' });
      store.db.prepare('UPDATE sessions SET expires = 0').run();
      expect(store.readSession(created.id)).toBeUndefined();
    } finally { store.close(); }
  });
});
