import { z } from 'zod';
import { HttpError, type Api } from './api.js';
import type { Intent, Pending, SessionData } from './types.js';
import { randomUUID } from 'node:crypto';

export function hashToChallenge(hash: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash))
    throw new HttpError(502, 'invalid_userop_hash', 'Expected a 32-byte userOpHash.');
  return Buffer.from(hash.slice(2), 'hex').toString('base64url');
}

export async function prepareEvm(api: Api, data: SessionData, intent: Intent): Promise<Pending> {
  const wallet = data.wallets?.find(
    (wallet) =>
      wallet.moduleId === 'evm_erc4337' &&
      wallet.status !== 'failed' &&
      /^0x[0-9a-fA-F]{40}$/.test(wallet.address),
  );
  if (!wallet || !data.passkeyPublicKey)
    throw new HttpError(
      409,
      'wallet_required',
      'Provision an EVM wallet and its passkey public key first.',
    );
  const prepared = z
    .object({ userOpHash: z.string(), threshold: z.number().int().positive() })
    .passthrough()
    .parse(
      await api('/v1/userops/prepare', {
        method: 'POST',
        customerId: data.customerId,
        body: {
          chain: intent.chain,
          token: intent.token.toLowerCase(),
          to: intent.recipientAddress,
          amount: intent.amount,
          safeAddress: wallet.address,
          passkeyPublicKey: data.passkeyPublicKey,
        },
      }),
    );
  if (prepared.threshold !== 1)
    throw new HttpError(
      409,
      'multiple_signers_required',
      'This sample demonstrates a single signer. Use the multi-signer integration for this wallet.',
    );
  return {
    id: randomUUID(),
    reference: prepared.userOpHash,
    userOpHash: prepared.userOpHash,
    challenge: hashToChallenge(prepared.userOpHash),
    intent,
    expiresAt: Date.now() + 120_000,
    state: 'prepared',
  };
}
