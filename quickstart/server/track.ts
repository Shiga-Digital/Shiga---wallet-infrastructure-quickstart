import { Router, type Response } from 'express';
import { HttpError, type Api } from './api.js';
import type { Store } from './store.js';

export function trackPaymentRoutes(
  api: Api,
  store: Store,
  owner: (res: Response) => string,
): Router {
  const router = Router();
  router.get('/payment-links/:id', async (req, res) => {
    const id = req.params.id;
    if (!store.ownsPayment(id, owner(res)))
      throw new HttpError(
        404,
        'payment_not_found',
        'This payment was not created in this sample session.',
      );
    res.json(await api('/v1/payments/' + encodeURIComponent(id)));
  });
  return router;
}
