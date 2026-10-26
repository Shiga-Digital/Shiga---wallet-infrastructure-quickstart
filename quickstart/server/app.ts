import express from 'express';
import { createApi, HttpError, type Api } from './api.js';
import type { Config } from './config.js';
import { errors, localApp, localOnly } from './http.js';
import type { Store } from './store.js';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessions, session } from './session.js';
import { customerRoutes } from './customers.js';
import { passkeyRoutes } from './passkeys.js';
import { quoteRoutes } from './quote.js';
import { paymentRoutes } from './payments.js';
import { statusRoutes } from './status.js';
import { Inbox } from './events.js';
import { webhookRoutes } from './webhooks.js';
import { createPaymentRoutes } from './create.js';
import { trackPaymentRoutes } from './track.js';

export function createApp(config: Config, store: Store, api: Api = createApi(config)) {
  const app = localApp(config);
  const inbox = new Inbox(store);
  app.use(webhookRoutes(inbox, config.webhookSecret));
  app.use(localOnly(config));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use(express.json({ limit: '64kb' }));
  app.use('/api', sessions(store, config));
  app.use('/api', (req, res, next) => {
    if (req.method === 'POST' && session(res).data.pending?.state === 'submitting') return next(new HttpError(409, 'approval_in_progress', 'Wait for the active approval to finish, then check its status.'));
    next();
  });
  app.get('/api/state', (_req, res) => {
    const data = session(res).data;
    res.json({ customerId: data.customerId, credentialId: data.credential?.id, wallets: data.wallets ?? [], pending: data.pending && { id: data.pending.id, state: data.pending.state, intent: data.pending.intent } });
  });
  app.get('/api/balances', async (_req, res) => {
    const data = session(res).data;
    if (!data.customerId) return res.status(409).json({ error: 'customer_required' });
    res.json(await api('/v1/wallets/balances?customerId=' + encodeURIComponent(data.customerId), { customerId: data.customerId }));
  });
  app.use('/api', customerRoutes(api, store));
  app.use('/api', passkeyRoutes(api, store, config));
  app.use('/api', quoteRoutes(api, store));
  app.use('/api', paymentRoutes(api, store, config));
  app.use('/api', statusRoutes(api, store));
  app.get('/api/events', (_req, res) => {
    const current = session(res);
    res.json(inbox.observations().filter(event => {
      if (event.event_type.startsWith('payment.')) return typeof event.data.payment_id === 'string' && store.ownsPayment(event.data.payment_id, current.id);
      return Boolean(current.data.customerId) && event.customer_id === current.data.customerId;
    }));
  });
  const owner = (res: express.Response) => session(res).id;
  app.use('/api', createPaymentRoutes(api, store, owner, true));
  app.use('/api', trackPaymentRoutes(api, store, owner));
  const require = createRequire(import.meta.url);
  const browserBundle = resolve(dirname(require.resolve('@simplewebauthn/browser')), '../dist/bundle/index.umd.min.js');
  app.get('/vendor/simplewebauthn.js', (_req, res) => res.sendFile(browserBundle));
  app.use(express.static(fileURLToPath(new URL('../web', import.meta.url)), { index: 'index.html', etag: false }));
  app.use(errors);
  return { app, inbox };
}
