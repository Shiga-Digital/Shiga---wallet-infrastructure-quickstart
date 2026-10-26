import { Router } from 'express';
import { z } from 'zod';
import type { Api } from './api.js';
import { HttpError } from './api.js';
import { session } from './session.js';
import type { Store } from './store.js';

export function customerRoutes(api: Api, store: Store): Router {
  const router = Router();
  router.post('/customers', async (req, res) => {
    const current = session(res);
    if (current.data.customerId)
      throw new HttpError(409, 'customer_exists', 'This session already has a customer.');
    const body = z
      .object({ reference: z.string().min(1).max(100) })
      .strict()
      .parse(req.body);
    const data = z
      .object({ id: z.string().min(1) })
      .parse(await api('/v1/customers', { method: 'POST', body }));
    current.data.customerId = data.id;
    current.data.reference = body.reference;
    store.saveSession(current.id, current.data);
    res.status(201).json({ customerId: data.id });
  });
  return router;
}
