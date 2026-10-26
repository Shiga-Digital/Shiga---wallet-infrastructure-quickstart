import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createPaymentRoutes } from '../server/create.js';
import { trackPaymentRoutes } from '../server/track.js';
import { errors } from '../server/http.js';
import { Store } from '../server/store.js';
import type { Api } from '../server/api.js';

const payment = { reference: 'invoice-1', destinations: { evm: { asset: 'USDT', amount: '1.5', destinationAddress: '0x' + '12'.repeat(20) } } };

describe('payment-link creation and tracking', () => {
  it('requires a caller-supplied idempotency key and preserves it on retry', async () => {
    const store = new Store(':memory:');
    try {
      const api = vi.fn<Api>(async () => ({ id: 'payment-1', status: 'AWAITING_PAYMENT', addresses: [{ chain: 'evm', address: 'receiving-address' }] }));
      const app = express(); app.use(express.json()); app.use(createPaymentRoutes(api, store, () => 'owner-1')); app.use(errors);
      expect((await request(app).post('/payment-links').send(payment)).status).toBe(400);
      expect(api).not.toHaveBeenCalled();
      for (let i = 0; i < 2; i++) expect((await request(app).post('/payment-links').set('Idempotency-Key', 'invoice-1-attempt-1').send(payment)).status).toBe(201);
      expect(api.mock.calls[0]).toEqual(['/v1/payments', { method: 'POST', body: payment, idempotencyKey: 'invoice-1-attempt-1' }]);
      expect(api.mock.calls[1]).toEqual(api.mock.calls[0]);
      expect(store.ownsPayment('payment-1', 'owner-1')).toBe(true);
    } finally { store.close(); }
  });
  it('does not allow one local session to read another session\'s payment', async () => {
    const store = new Store(':memory:');
    try {
      store.ownPayment('payment-1', 'owner-1');
      const api = vi.fn<Api>(async () => ({ id: 'payment-1', status: 'FULFILLED', addresses: [], attempts: [{ status: 'PENDING_APPROVAL' }] }));
      const app = express(); app.use(trackPaymentRoutes(api, store, res => String(res.req.get('x-test-owner')))); app.use(errors);
      expect((await request(app).get('/payment-links/payment-1').set('x-test-owner', 'owner-2')).status).toBe(404);
      expect(api).not.toHaveBeenCalled();
      const response = await request(app).get('/payment-links/payment-1').set('x-test-owner', 'owner-1');
      expect(response.body.attempts[0].status).toBe('PENDING_APPROVAL');
      expect(api).toHaveBeenCalledWith('/v1/payments/payment-1');
    } finally { store.close(); }
  });
  it('refuses unsupported families and zero or exponent amounts', async () => {
    const store = new Store(':memory:');
    try {
      const api = vi.fn<Api>();
      const app = express(); app.use(express.json()); app.use(createPaymentRoutes(api, store, () => 'owner-1')); app.use(errors);
      for (const amount of ['0', '0.000', '1e-6', '-1']) {
        const body = { reference: 'x', destinations: { evm: { ...payment.destinations.evm, amount } } };
        expect((await request(app).post('/payment-links').set('Idempotency-Key', 'k').send(body)).status).toBe(400);
      }
      expect((await request(app).post('/payment-links').set('Idempotency-Key', 'k').send({ reference: 'x', destinations: { base: payment.destinations.evm } })).status).toBe(400);
      expect(api).not.toHaveBeenCalled();
    } finally { store.close(); }
  });
});


it('namespaces browser payment idempotency so a different session cannot claim the same upstream key', async () => {
  const store = new Store(':memory:');
  try {
    const api = vi.fn<Api>(async () => ({ id: 'payment-1', status: 'AWAITING_PAYMENT', addresses: [] }));
    const app = express(); app.use(express.json()); app.use(createPaymentRoutes(api, store, res => String(res.req.get('x-test-owner')), true)); app.use(errors);
    for (const owner of ['owner-1', 'owner-1', 'owner-2']) expect((await request(app).post('/payment-links').set('x-test-owner', owner).set('Idempotency-Key', 'same-key').send(payment)).status).toBe(201);
    const keys = api.mock.calls.map(([, options]) => options?.idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  } finally { store.close(); }
});
