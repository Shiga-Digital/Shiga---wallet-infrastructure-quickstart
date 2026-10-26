import express from 'express';
import { createApi, type Api } from './api.js';
import type { Config } from './config.js';
import { errors, localApp, localOnly } from './http.js';
import type { Store } from './store.js';
import { Inbox } from './events.js';
import { webhookRoutes } from './webhooks.js';

export function createApp(config: Config, store: Store, _api: Api = createApi(config)) {
  const app = localApp(config);
  const inbox = new Inbox(store);
  app.use(webhookRoutes(inbox, config.webhookSecret));
  app.use(localOnly(config));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use(express.json({ limit: '64kb' }));
  app.use(errors);
  return { app, inbox };
}
