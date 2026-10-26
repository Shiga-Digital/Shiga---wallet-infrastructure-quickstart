import { Router } from 'express';
import { z } from 'zod';
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { HttpError, type Api } from './api.js';
import type { Config } from './config.js';
import type { Store } from './store.js';
import { session } from './session.js';
import { prepareEvm } from './evm.js';
import { prepareOther } from './other-networks.js';

export function paymentRoutes(api: Api, store: Store, config: Config): Router {
  const router = Router();
  router.post('/payments/prepare', async (req, res) => {
    const current = session(res);
    const { quoteId } = z.object({ quoteId: z.string().uuid() }).strict().parse(req.body);
    const quote = current.data.quote;
    if (
      !current.data.customerId ||
      !current.data.credential ||
      !quote ||
      quote.id !== quoteId ||
      quote.expiresAt < Date.now()
    )
      throw new HttpError(409, 'quote_expired', 'Get a fresh quote first.');
    if (current.data.pending && ['submitting', 'uncertain'].includes(current.data.pending.state))
      throw new HttpError(
        409,
        'outcome_unknown',
        'Reconcile the previous transfer before preparing another one.',
      );
    delete current.data.quote;
    store.saveSession(current.id, current.data);
    const pending =
      quote.intent.moduleId === 'evm_erc4337'
        ? await prepareEvm(api, current.data, quote.intent)
        : prepareOther(config, store, current.data.customerId, quote.intent);
    current.data.pending = pending;
    store.saveSession(current.id, current.data);
    res.json({
      paymentId: pending.id,
      intent: pending.intent,
      userOpHash: pending.userOpHash,
      options: {
        challenge: pending.challenge,
        rpId: config.rpId,
        allowCredentials: [{ id: current.data.credential.id, type: 'public-key' }],
        userVerification: 'required',
      },
    });
  });
  router.post('/payments/approve', async (req, res) => {
    const current = session(res);
    const { paymentId, assertion } = z
      .object({
        paymentId: z.string().uuid(),
        assertion: z
          .object({
            id: z.string(),
            rawId: z.string(),
            type: z.literal('public-key'),
            clientExtensionResults: z.object({}).passthrough(),
            response: z
              .object({
                clientDataJSON: z.string(),
                authenticatorData: z.string(),
                signature: z.string(),
                userHandle: z.string().optional(),
              })
              .passthrough(),
          })
          .passthrough(),
      })
      .strict()
      .parse(req.body);
    const pending = current.data.pending;
    const credential = current.data.credential;
    if (
      !pending ||
      !credential ||
      pending.id !== paymentId ||
      pending.state !== 'prepared' ||
      pending.expiresAt < Date.now() ||
      assertion.id !== credential.id
    )
      throw new HttpError(409, 'approval_expired', 'Prepare a fresh payment in this session.');
    pending.state = 'submitting';
    store.saveSession(current.id, current.data);
    store.beginApproval(current.id);
    try {
      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: assertion as AuthenticationResponseJSON,
          expectedChallenge: pending.challenge,
          expectedOrigin: config.origin,
          expectedRPID: config.rpId,
          requireUserVerification: true,
          credential: {
            id: credential.id,
            publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64url')),
            counter: credential.counter,
          },
        });
        if (!verification.verified) throw new Error('Invalid assertion');
      } catch {
        pending.state = 'rejected';
        store.saveSession(current.id, current.data);
        throw new HttpError(
          400,
          'invalid_assertion',
          'The passkey assertion did not verify. Prepare again.',
        );
      }
      const previousCounter = credential.counter;
      credential.counter = verification.authenticationInfo.newCounter;
      store.saveSession(current.id, current.data);
      const passkeyData = {
        credential: assertion,
        expectedChallenge: pending.challenge,
        expectedOrigins: [config.origin],
        expectedRPID: config.rpId,
        authenticator: {
          credentialId: credential.id,
          credentialPublicKey: credential.publicKey,
          counter: previousCounter,
        },
      };
      try {
        pending.result = pending.userOpHash
          ? await api('/v1/userops/' + encodeURIComponent(pending.userOpHash) + '/signatures', {
              method: 'POST',
              customerId: current.data.customerId,
              body: { passkeyPublicKey: current.data.passkeyPublicKey, passkeyData },
            })
          : await api('/v1/transactions', {
              method: 'POST',
              customerId: current.data.customerId,
              body: { moduleId: pending.intent.moduleId, txParams: pending.txParams, passkeyData },
            });
        pending.state = 'submitted';
      } catch (error) {
        pending.state = 'uncertain';
        store.saveSession(current.id, current.data);
        throw error;
      }
      store.saveSession(current.id, current.data);
      res.json({
        paymentId: pending.id,
        status: 'submitted',
        reference: pending.reference,
        result: pending.result,
      });
    } finally {
      store.endApproval(current.id);
    }
  });
  return router;
}
