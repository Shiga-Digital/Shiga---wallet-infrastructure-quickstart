import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from './api.js';

export function verifyWebhook(secret: string, rawBody: Buffer, signature: string, timestamp: string, now = Date.now()): void {
  const parts = /^t=(\d{1,12}),v1=([a-fA-F0-9]{64})$/.exec(signature);
  if (!parts || !/^\d{1,12}$/.test(timestamp) || parts[1] !== timestamp) throw new HttpError(401, 'invalid_signature', 'Invalid webhook signature.');
  const expected = createHmac('sha256', secret).update(parts[1] + '.').update(rawBody).digest();
  const provided = Buffer.from(parts[2], 'hex');
  if (!timingSafeEqual(expected, provided)) throw new HttpError(401, 'invalid_signature', 'Invalid webhook signature.');
  if (Math.abs(now / 1000 - Number(parts[1])) > 300) throw new HttpError(400, 'stale_event', 'Webhook timestamp is outside the five-minute window.');
}
