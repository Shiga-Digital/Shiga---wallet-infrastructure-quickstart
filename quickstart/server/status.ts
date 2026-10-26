import { Router } from 'express';
import { z } from 'zod';
import { HttpError, type Api } from './api.js';
import { session } from './session.js';
import type { Store } from './store.js';

const pageSchema = z.object({ items: z.array(z.object({ customerId: z.string().nullable(), reference: z.string().nullable(), status: z.enum(['submitted', 'pending', 'confirmed', 'failed']), outcomeUndetermined: z.boolean().optional() }).passthrough()), nextCursor: z.string().optional().nullable() });

export function statusRoutes(api: Api, store: Store): Router {
  const router = Router();
  router.get('/payments/status', async (_req, res) => {
    const local = session(res);
    const current = local.data;
    const pending = current.pending;
    if (!pending || !current.customerId) throw new HttpError(404, 'payment_not_found', 'No payment has been prepared in this session.');
    let cursor: string | undefined;
    for (let index = 0; index < 10; index++) {
      const query = new URLSearchParams({ chain: pending.intent.chain, limit: '100' });
      if (cursor) query.set('cursor', cursor);
      const page = pageSchema.parse(await api('/v1/transactions?' + query.toString(), { customerId: current.customerId }));
      const transaction = page.items.find(item => item.customerId === current.customerId && item.reference === pending.reference);
      if (transaction) {
        if (pending.state !== 'submitting' && (transaction.status === 'confirmed' || (transaction.status === 'failed' && !transaction.outcomeUndetermined))) { pending.state = transaction.status; store.saveSession(local.id, current); }
        return res.json({ paymentId: pending.id, status: transaction.status, transaction });
      }
      cursor = page.nextCursor ?? undefined;
      if (!cursor) return res.json({ paymentId: pending.id, status: pending.state === 'prepared' || pending.state === 'rejected' ? pending.state : 'pending', submissionState: pending.state, message: 'No matching transaction is visible yet. Only confirmed means complete.' });
    }
    throw new HttpError(409, 'reconciliation_required', 'Transaction history exceeded this sample\'s page limit. Reconcile using your stored webhook events.');
  });
  return router;
}
