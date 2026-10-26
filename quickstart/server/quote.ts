import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { HttpError, type Api } from './api.js';
import { session } from './session.js';
import type { Store } from './store.js';
import { intentSchema } from './types.js';

const evmChains = ['ethereum', 'base', 'arbitrum', 'polygon', 'celo', 'optimism', 'plasma'];
export function quoteRoutes(api: Api, store: Store): Router {
  const router = Router();
  router.post('/payments/quote', async (req, res) => {
    const current = session(res);
    if (!current.data.customerId || !current.data.credential)
      throw new HttpError(
        409,
        'registration_required',
        'Register a passkey or configure CUSTOMER_CONTEXT_FILE first.',
      );
    const intent = intentSchema.parse(req.body);
    if (intent.moduleId === 'evm_erc4337') {
      if (
        !evmChains.includes(intent.chain) ||
        !['usdt', 'xaut'].includes(intent.token.toLowerCase()) ||
        !/^0x[0-9a-fA-F]{40}$/.test(intent.recipientAddress) ||
        (intent.amount.split('.')[1]?.length ?? 0) > 6
      )
        throw new HttpError(
          400,
          'invalid_evm_intent',
          'Check the EVM chain, token, address and amount (at most six decimal places).',
        );
    } else if (intent.chain !== intent.moduleId)
      throw new HttpError(400, 'invalid_chain', 'A non-EVM chain must match its module.');
    if (
      (intent.tokenMint && intent.moduleId !== 'solana') ||
      (intent.tokenRoot && intent.moduleId !== 'ton')
    )
      throw new HttpError(
        400,
        'invalid_asset_selector',
        'tokenMint is only for Solana; tokenRoot is only for TON.',
      );
    if (intent.moduleId !== 'evm_erc4337') {
      if (['bitcoin', 'spark'].includes(intent.moduleId)) {
        if (intent.token.toUpperCase() !== 'BTC')
          throw new HttpError(400, 'invalid_asset', 'Bitcoin and Spark transfers use BTC.');
        intent.token = 'BTC';
      } else {
        const selector = intent.tokenMint ?? intent.tokenRoot;
        if (
          !['usdt', 'usd\u20ae'].includes(intent.token.toLowerCase()) &&
          intent.token !== selector
        )
          throw new HttpError(
            400,
            'asset_selector_required',
            'Custom assets require a matching explicit tokenMint or tokenRoot selector.',
          );
        if (
          intent.moduleId === 'tron' &&
          !['usdt', 'usd\u20ae'].includes(intent.token.toLowerCase())
        )
          throw new HttpError(
            400,
            'unsupported_asset',
            'This sample supports the deployment default USDT asset on Tron.',
          );
        intent.token = selector ?? 'usdt';
      }
    }
    const data = await api('/v1/quotes', {
      method: 'POST',
      customerId: current.data.customerId,
      body: {
        moduleId: intent.moduleId,
        txParams: {
          chain: intent.chain,
          amount: intent.amount,
          recipientAddress: intent.recipientAddress,
          token: intent.tokenMint ?? intent.tokenRoot ?? intent.token,
        },
      },
    });
    const quote = { id: randomUUID(), intent, data, expiresAt: Date.now() + 120_000 };
    current.data.quote = quote;
    store.saveSession(current.id, current.data);
    res.json(quote);
  });
  return router;
}
