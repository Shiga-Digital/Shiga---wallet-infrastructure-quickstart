import { Router, type Response } from 'express';
import { z } from 'zod';
import { HttpError, type Api } from './api.js';
import { digest, type Store } from './store.js';

const destination = z.object({ asset: z.string().min(1).max(150), amount: z.string().max(80).regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/).refine(value => /[1-9]/.test(value)), destinationAddress: z.string().min(1).max(150) }).strict();
const bodySchema = z.object({ reference: z.string().min(1).max(200), destinations: z.object({ evm: destination.optional(), bitcoin: destination.optional(), spark: destination.optional(), solana: destination.optional(), tron: destination.optional(), ton: destination.optional() }).strict().refine(value => Object.values(value).some(Boolean)) }).strict();

export function createPaymentRoutes(api: Api, store: Store, owner: (res: Response) => string, namespaceKeys = false): Router {
  const router = Router();
  router.post('/payment-links', async (req, res) => {
    const key = req.get('idempotency-key');
    if (!key || !/^[A-Za-z0-9._-]{1,128}$/.test(key)) throw new HttpError(400, 'idempotency_key_required', 'Supply a stable Idempotency-Key for this payment and reuse it on retry.');
    const body = bodySchema.parse(req.body);
    const ownerId = owner(res);
    const idempotencyKey = namespaceKeys ? digest(ownerId + ':' + key) : key;
    const data = z.object({ id: z.string().min(1), status: z.enum(['AWAITING_PAYMENT', 'FULFILLED', 'EXPIRED', 'CANCELLED']), addresses: z.array(z.unknown()) }).passthrough().parse(await api('/v1/payments', { method: 'POST', body, idempotencyKey }));
    store.ownPayment(data.id, ownerId);
    res.status(201).json(data);
  });
  return router;
}
