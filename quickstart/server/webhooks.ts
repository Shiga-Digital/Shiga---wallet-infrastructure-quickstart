import express, { Router } from 'express';
import { HttpError } from './api.js';
import { verifyWebhook } from './verify.js';
import type { Inbox } from './events.js';

export function webhookRoutes(inbox: Inbox, secret: string): Router {
  if (!secret || /replace|\.\.\./i.test(secret))
    throw new Error("Set WEBHOOK_SECRET to the endpoint signing secret in this sample's .env");
  const router = Router();
  router.post(
    '/webhooks/wallet',
    express.raw({ type: 'application/json', limit: '256kb', inflate: false }),
    (req, res) => {
      if (!Buffer.isBuffer(req.body))
        throw new HttpError(415, 'json_required', 'Send an uncompressed application/json body.');
      verifyWebhook(secret, req.body, req.get('x-signature') ?? '', req.get('x-timestamp') ?? '');
      const created = inbox.accept(
        req.body,
        req.get('x-idempotency-key') ?? '',
        req.get('x-event-type') ?? '',
      );
      res.status(200).json({ received: true, duplicate: !created });
    },
  );
  return router;
}
