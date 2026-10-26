import express from 'express';
import { createApi, type Api } from './api.js';
import type { Config } from './config.js';
import { errors, localApp, localOnly } from './http.js';
import type { Store } from './store.js';
import { createPaymentRoutes } from './create.js';
import { trackPaymentRoutes } from './track.js';

export function createApp(config: Config, store: Store, api: Api = createApi(config)) {
  const app = localApp(config);
  app.use(localOnly(config));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use(express.json({ limit: '64kb' }));
  const owner = () => 'local';
  app.use('/api', createPaymentRoutes(api, store, owner));
  app.use('/api', trackPaymentRoutes(api, store, owner));
  app.use(errors);
  return { app };
}
