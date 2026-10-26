
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { customerFixture } from './authenticator.js';

it('requires payment ownership even when a session has no customer or an event names its customer', async () => {
  const fixture = customerFixture();
  const store = new Store(':memory:');
  try {
    const { app, inbox } = createApp(fixture.config, store, async () => ({}));
    const owner = store.newSession();
    store.saveSession(owner.id, { customerId: 'c1' });
    store.ownPayment('private-payment', owner.id);
    const unrelated = store.newSession();
    store.saveSession(unrelated.id, { customerId: 'c1' });
    for (const [id, customer] of [['payment-event-1', undefined], ['payment-event-2', 'c1']]) {
      const event = { event_id: id, event_type: 'payment.created', business_id: 'b1', project_id: 'p1', customer_id: customer, occurred_at: '2026-10-26T10:00:00Z', data: { payment_id: 'private-payment', reference: 'private-invoice', amount: '10' } };
      inbox.accept(Buffer.from(JSON.stringify(event)), String(id), event.event_type);
      inbox.processOne();
    }
    expect((await request(app).get('/api/events').set('Host', 'localhost:3000')).body).toEqual([]);
    expect((await request(app).get('/api/events').set('Host', 'localhost:3000').set('Cookie', 'shiga_3000=' + unrelated.token)).body).toEqual([]);
    expect((await request(app).get('/api/events').set('Host', 'localhost:3000').set('Cookie', 'shiga_3000=' + owner.token)).body).toHaveLength(2);
  } finally { store.close(); fixture.cleanup(); }
});

describe('session compare-and-swap', () => {
  it('does not allow any stale object to overwrite a newer persisted state', () => {
    const store = new Store(':memory:');
    try {
      const created = store.newSession();
      const first = store.readSession(created.id) as object;
      const stale = store.readSession(created.id) as object;
      Object.assign(first, { pending: { state: 'uncertain' } });
      store.saveSession(created.id, first);
      Object.assign(stale, { pending: { state: 'prepared' } });
      expect(() => store.saveSession(created.id, stale)).toThrow('Another request changed');
      expect(store.readSession(created.id)).toMatchObject({ pending: { state: 'uncertain' } });
    } finally { store.close(); }
  });
});
