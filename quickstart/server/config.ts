import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { z } from 'zod';

export interface Config {
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
  port: number;
  origin: string;
  rpId: string;
  databasePath: string;
  businessId?: string;
  projectId?: string;
  contextFile?: string;
}

export function readConfig(defaultPort: number, needsApi = true): Config {
  if (existsSync('.env')) loadEnvFile('.env');
  const port = z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .parse(process.env.PORT ?? defaultPort);
  const origin = new URL(process.env.ORIGIN ?? 'http://localhost:' + port);
  const rpId = process.env.RP_ID ?? 'localhost';
  if (origin.origin !== origin.href.replace(/\/$/, ''))
    throw new Error('ORIGIN must have no path, query or fragment');
  if (
    origin.protocol !== 'https:' &&
    !(origin.protocol === 'http:' && origin.hostname === 'localhost')
  )
    throw new Error('Use HTTPS for passkeys, or http://localhost for development');
  if (origin.hostname !== rpId && !origin.hostname.endsWith('.' + rpId))
    throw new Error('RP_ID must match ORIGIN or its parent domain');
  const apiUrl = new URL(process.env.SHIGA_API_URL ?? 'https://api.pilot.shiga.io');
  if (
    apiUrl.protocol !== 'https:' ||
    apiUrl.pathname !== '/' ||
    apiUrl.search ||
    apiUrl.hash ||
    apiUrl.username ||
    apiUrl.password
  )
    throw new Error('SHIGA_API_URL must be an HTTPS origin without credentials');
  const apiKey = process.env.SHIGA_API_KEY ?? '';
  if (needsApi && (!apiKey.startsWith('sk_test_') || /replace|\.\.\./i.test(apiKey)))
    throw new Error("Set SHIGA_API_KEY to your pilot test key in this sample's .env");
  return {
    apiUrl: apiUrl.origin,
    apiKey,
    webhookSecret: process.env.WEBHOOK_SECRET ?? '',
    port,
    origin: origin.origin,
    rpId,
    databasePath: process.env.DATABASE_PATH ?? '.data/sample.sqlite',
    businessId: process.env.SHIGA_BUSINESS_ID,
    projectId: process.env.SHIGA_PROJECT_ID,
    contextFile: process.env.CUSTOMER_CONTEXT_FILE,
  };
}
