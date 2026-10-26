import { createHash, randomUUID } from 'node:crypto';
import { HttpError } from './api.js';
import type { Config } from './config.js';
import type { Intent, Pending } from './types.js';
import type { Store } from './store.js';

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function transactionChallenge(
  entityKey: string,
  moduleId: string,
  txParams: Record<string, unknown>,
): string {
  const intent = Object.fromEntries(
    Object.entries(txParams)
      .filter(([key]) => key !== 'selectedPayment')
      .map(([key, value]) => [
        key,
        key === 'networkConfig' && value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value).filter(([key]) => ['tokenMint', 'tokenRoot'].includes(key)),
            )
          : value,
      ]),
  );
  return createHash('sha256')
    .update(JSON.stringify(canonicalize({ entityKey, moduleId, txParams: intent })))
    .digest('base64url');
}

export function prepareOther(
  config: Config,
  store: Store,
  customerId: string,
  intent: Intent,
): Pending {
  if (
    !config.businessId ||
    !config.projectId ||
    ![config.businessId, config.projectId, customerId].every((value) =>
      /^[A-Za-z0-9._-]+$/.test(value),
    )
  )
    throw new HttpError(
      409,
      'tenant_ids_required',
      'Set SHIGA_BUSINESS_ID and SHIGA_PROJECT_ID for the API key before sending on non-EVM networks.',
    );
  const networkConfig: Record<string, string> = {};
  if (intent.tokenMint) networkConfig.tokenMint = intent.tokenMint;
  if (intent.tokenRoot) networkConfig.tokenRoot = intent.tokenRoot;
  const txParams = {
    chain: intent.chain,
    amount: intent.amount,
    recipientAddress: intent.recipientAddress,
    transactionId: store.nextTransactionId(),
    selectedPayment: 'native',
    networkConfig,
  };
  const entityKey =
    'biz:' + config.businessId + ':proj:' + config.projectId + ':cust:' + customerId;
  const challenge = transactionChallenge(entityKey, intent.moduleId, txParams);
  return {
    id: randomUUID(),
    reference: challenge,
    challenge,
    txParams,
    intent,
    expiresAt: Date.now() + 120_000,
    state: 'prepared',
  };
}
