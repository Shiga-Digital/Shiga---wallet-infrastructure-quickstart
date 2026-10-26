import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Store } from '../server/store.js';
import { Inbox } from '../server/events.js';
import { webhookRoutes } from '../server/webhooks.js';
import { verifyWebhook } from '../server/verify.js';
import { errors } from '../server/http.js';

const secret = 'fixture-webhook-signing-key';
const event = {
  event_id: 'event-1',
  event_type: 'deposit.confirmed',
  business_id: 'b1',
  project_id: 'p1',
  customer_id: 'c1',
  occurred_at: '2026-10-26T10:00:00Z',
  data: {
    transaction_id: 'tx-1',
    amount: '1',
    cancellation_token: 'must-never-be-stored',
    nested: { secret: 'must-never-be-stored' },
  },
};
const body = Buffer.from(JSON.stringify(event, null, 2) + '\n');
function signature(raw: Buffer, time: number) {
  return (
    't=' +
    time +
    ',v1=' +
    createHmac('sha256', secret)
      .update(time + '.')
      .update(raw)
      .digest('hex')
  );
}
function setup(store: Store) {
  const inbox = new Inbox(store);
  const app = express();
  app.use(webhookRoutes(inbox, secret));
  app.use(express.json());
  app.use(errors);
  const deliver = (raw = body, signed = raw, time = Math.floor(Date.now() / 1000)) =>
    request(app)
      .post('/webhooks/wallet')
      .set('Content-Type', 'application/json')
      .set('x-signature', signature(signed, time))
      .set('x-timestamp', String(time))
      .set('x-idempotency-key', event.event_id)
      .set('x-event-type', event.event_type)
      .send(raw.toString('utf8'));
  return { inbox, deliver, app };
}

describe('webhook authenticity and freshness', () => {
  it('verifies the exact raw bytes, including whitespace', () => {
    const now = Date.now(),
      time = Math.floor(now / 1000);
    expect(() =>
      verifyWebhook(secret, body, signature(body, time), String(time), now),
    ).not.toThrow();
    expect(() =>
      verifyWebhook(
        secret,
        Buffer.from(JSON.stringify(event)),
        signature(body, time),
        String(time),
        now,
      ),
    ).toThrow();
  });
  it.each(['missing', 'short-mac', 'timestamp-substitution', 'old', 'future', 'duplicate-fields'])(
    'rejects %s',
    (kind) => {
      const now = Date.now(),
        time = Math.floor(now / 1000),
        signedTime = kind === 'old' ? time - 301 : kind === 'future' ? time + 301 : time;
      const header =
        kind === 'missing'
          ? ''
          : kind === 'short-mac'
            ? 't=' + time + ',v1=ab'
            : signature(body, signedTime) + (kind === 'duplicate-fields' ? ',t=' + time : '');
      const timestamp = kind === 'timestamp-substitution' ? String(time + 1) : String(signedTime);
      expect(() => verifyWebhook(secret, body, header, timestamp, now)).toThrow();
    },
  );
});

describe('durable acknowledgement and processing', () => {
  it('stores before 2xx, deduplicates concurrent deliveries and applies one local observation', async () => {
    const store = new Store(':memory:');
    try {
      const { deliver, inbox } = setup(store);
      const responses = await Promise.all([deliver(), deliver()]);
      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect(responses.map((response) => response.body.duplicate).sort()).toEqual([false, true]);
      expect(store.db.prepare('SELECT count(*) AS count FROM inbox').get()?.count).toBe(1);
      expect(inbox.observations()).toEqual([]);
      expect(inbox.processOne()).toBe(true);
      expect(inbox.processOne()).toBe(false);
      expect(inbox.observations()).toHaveLength(1);
      expect(JSON.stringify(store.db.prepare('SELECT payload FROM inbox').all())).not.toContain(
        'must-never-be-stored',
      );
    } finally {
      store.close();
    }
  });
  it('rejects tampering and mismatched signed header identities without persisting', async () => {
    const store = new Store(':memory:');
    try {
      const { deliver, app } = setup(store);
      expect(
        (
          await deliver(
            Buffer.from(body.toString().replace('"amount": "1"', '"amount": "2"')),
            body,
          )
        ).status,
      ).toBe(401);
      const time = Math.floor(Date.now() / 1000);
      const response = await request(app)
        .post('/webhooks/wallet')
        .set('Content-Type', 'application/json')
        .set('x-signature', signature(body, time))
        .set('x-timestamp', String(time))
        .set('x-idempotency-key', 'substituted-id')
        .set('x-event-type', event.event_type)
        .send(body.toString());
      expect(response.status).toBe(400);
      expect(store.db.prepare('SELECT count(*) AS count FROM inbox').get()?.count).toBe(0);
    } finally {
      store.close();
    }
  });
  it('returns a retryable failure if durable storage fails', async () => {
    const store = new Store(':memory:');
    try {
      const { deliver } = setup(store);
      store.db.exec('DROP TABLE inbox');
      expect((await deliver()).status).toBe(500);
    } finally {
      store.close();
    }
  });
  it('reopens an acknowledged but unprocessed event after restart and rolls back failed processing', () => {
    const directory = mkdtempSync(join(tmpdir(), 'shiga-samples-test-'));
    const target = resolve(directory);
    if (
      !target.startsWith(resolve(tmpdir()) + sep) ||
      !basename(target).startsWith('shiga-samples-test-')
    )
      throw new Error('Unexpected cleanup target');
    const file = join(directory, 'inbox.sqlite');
    let store = new Store(file);
    try {
      new Inbox(store).accept(body, event.event_id, event.event_type);
      store.close();
      store = new Store(file);
      const inbox = new Inbox(store);
      expect(inbox.accept(body, event.event_id, event.event_type)).toBe(false);
      store.db.exec(
        "CREATE TRIGGER fail_observation BEFORE INSERT ON observations BEGIN SELECT RAISE(ABORT, 'fixture processing failure'); END",
      );
      expect(() => inbox.processOne()).toThrow();
      expect(store.db.prepare('SELECT processed FROM inbox').get()?.processed).toBe(0);
      store.db.exec('DROP TRIGGER fail_observation');
      expect(inbox.processOne()).toBe(true);
      expect(inbox.observations()[0].event_id).toBe('event-1');
    } finally {
      store.close();
      rmSync(target, { recursive: true, force: true });
    }
  });
});
