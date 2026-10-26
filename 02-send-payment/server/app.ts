import express from 'express';
import { createApi, HttpError, type Api } from './api.js';
import type { Config } from './config.js';
import { errors, localApp, localOnly } from './http.js';
import type { Store } from './store.js';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sessions, session } from './session.js';
import { contextSchema } from './types.js';
import { quoteRoutes } from './quote.js';
import { paymentRoutes } from './payments.js';
import { statusRoutes } from './status.js';

export function createApp(config: Config, store: Store, api: Api = createApi(config)) {
  const app = localApp(config);
  app.use(localOnly(config));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use(express.json({ limit: '64kb' }));
  app.use('/api', sessions(store, config));
  if (!config.contextFile) throw new Error('Set CUSTOMER_CONTEXT_FILE to the public customer-context.json exported by onboarding.');
  const imported = contextSchema.parse(JSON.parse(readFileSync(config.contextFile, 'utf8')));
  if (imported.rpId !== config.rpId || imported.origin !== config.origin) throw new Error('Customer context RP/origin must match this sample. Run samples 01 and 02 sequentially on the same ORIGIN.');
  app.use('/api', (_req, res, next) => {
    const current = session(res);
    if (!current.data.customerId) {
      Object.assign(current.data, { customerId: imported.customerId, credential: { ...imported.credential }, wallets: imported.wallets, passkeyPublicKey: imported.passkeyPublicKey });
      store.saveSession(current.id, current.data);
    }
    next();
  });
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
  app.use('/api', quoteRoutes(api, store));
  app.use('/api', paymentRoutes(api, store, config));
  app.use('/api', statusRoutes(api, store));
  const require = createRequire(import.meta.url);
  const browserBundle = resolve(dirname(require.resolve('@simplewebauthn/browser')), '../dist/bundle/index.umd.min.js');
  app.get('/vendor/simplewebauthn.js', (_req, res) => res.sendFile(browserBundle));
  app.use(express.static(fileURLToPath(new URL('../web', import.meta.url)), { index: 'index.html', etag: false }));
  app.use(errors);
  return { app };
}
