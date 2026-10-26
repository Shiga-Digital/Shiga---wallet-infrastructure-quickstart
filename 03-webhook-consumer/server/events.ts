import { z } from 'zod';
import { digest, type Store } from './store.js';
import { HttpError } from './api.js';

const envelope = z.object({
  event_id: z.string().min(1).max(250),
  event_type: z.string().min(1).max(100),
  business_id: z.string().min(1),
  project_id: z.string().min(1),
  customer_id: z.string().nullable().optional(),
  occurred_at: z.string().datetime({ offset: true }),
  data: z.record(z.string(), z.unknown()),
});
const publicFields = new Set([
  'transaction_id',
  'payment_id',
  'wallet_id',
  'transaction_hash',
  'tx_hash',
  'status',
  'chain',
  'amount',
  'asset',
  'reference',
  'outcome_undetermined',
]);
export type Event = z.infer<typeof envelope>;

export class Inbox {
  constructor(private store: Store) {}
  accept(rawBody: Buffer, eventId: string, eventType: string): boolean {
    const event = envelope.parse(JSON.parse(rawBody.toString('utf8')));
    if (event.event_id !== eventId || event.event_type !== eventType)
      throw new HttpError(
        400,
        'event_header_mismatch',
        'The event headers must match the signed body.',
      );
    if (event.event_type.startsWith('recovery.'))
      throw new HttpError(
        400,
        'unsupported_event',
        'This sample accepts wallet, transaction, deposit and payment subscriptions.',
      );
    event.data = Object.fromEntries(
      Object.entries(event.data).filter(
        ([key, value]) =>
          publicFields.has(key) && ['string', 'number', 'boolean'].includes(typeof value),
      ),
    );
    const fingerprint = digest(rawBody);
    const result = this.store.db
      .prepare(
        'INSERT INTO inbox (event_id, fingerprint, payload) VALUES (?, ?, ?) ON CONFLICT(event_id) DO NOTHING',
      )
      .run(event.event_id, fingerprint, JSON.stringify(event));
    if (result.changes === 0) {
      const existing = this.store.db
        .prepare('SELECT fingerprint FROM inbox WHERE event_id = ?')
        .get(event.event_id);
      if (existing?.fingerprint !== fingerprint)
        throw new HttpError(
          409,
          'event_id_conflict',
          'An existing event has this id and a different body.',
        );
    }
    return result.changes === 1;
  }
  processOne(): boolean {
    this.store.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.store.db
        .prepare('SELECT event_id, payload FROM inbox WHERE processed = 0 ORDER BY rowid LIMIT 1')
        .get();
      if (!row) {
        this.store.db.exec('COMMIT');
        return false;
      }
      this.store.db
        .prepare('INSERT OR IGNORE INTO observations VALUES (?, ?)')
        .run(row.event_id as string, row.payload as string);
      this.store.db
        .prepare('UPDATE inbox SET processed = 1 WHERE event_id = ?')
        .run(row.event_id as string);
      this.store.db.exec('COMMIT');
      return true;
    } catch (error) {
      this.store.db.exec('ROLLBACK');
      throw error;
    }
  }
  observations(): Event[] {
    return this.store.db
      .prepare('SELECT payload FROM observations ORDER BY rowid DESC LIMIT 100')
      .all()
      .map((row) => envelope.parse(JSON.parse(String(row.payload))));
  }
  startWorker(): () => void {
    const timer = setInterval(() => {
      try {
        let count = 0;
        while (count < 20 && this.processOne()) count++;
      } catch {
        console.error('Webhook processing failed; events remain in the durable inbox.');
      }
    }, 1000);
    timer.unref();
    return () => clearInterval(timer);
  }
}
