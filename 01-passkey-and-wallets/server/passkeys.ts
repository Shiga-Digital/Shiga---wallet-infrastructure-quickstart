import { Router } from 'express';
import { generateRegistrationOptions, verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server';
import { z } from 'zod';
import { HttpError, type Api } from './api.js';
import type { Config } from './config.js';
import { digest, type Store } from './store.js';
import { session, type Session } from './session.js';
import { walletSchema } from './types.js';

export async function provision(current: Session, api: Api, store: Store, config: Config): Promise<unknown> {
  const credential = current.data.credential;
  if (!current.data.customerId || !credential) throw new HttpError(409, 'registration_required', 'Create a customer and verify their passkey first.');
  const data = z.object({ wallets: z.array(walletSchema), passkeyPublicKey: z.object({ x: z.string(), y: z.string() }).optional() }).passthrough().parse(await api('/v1/wallets/provision', {
    method: 'POST', customerId: current.data.customerId,
    body: { passkeyRegistration: { credentialId: credential.id, credentialPublicKey: credential.publicKey, rpId: config.rpId, origins: [config.origin] } },
  }));
  current.data.wallets = data.wallets;
  current.data.passkeyPublicKey = data.passkeyPublicKey;
  store.saveSession(current.id, current.data);
  return data;
}

export function passkeyRoutes(api: Api, store: Store, config: Config): Router {
  const router = Router();
  router.post('/passkeys/options', async (_req, res) => {
    const current = session(res);
    if (!current.data.customerId) throw new HttpError(409, 'customer_required', 'Create the customer first.');
    if (current.data.credential) throw new HttpError(409, 'passkey_exists', 'Use the provision retry button for this registered passkey.');
    const options = await generateRegistrationOptions({ rpName: 'Shiga integration sample', rpID: config.rpId, userID: new TextEncoder().encode(current.data.customerId), userName: current.data.reference ?? current.data.customerId, attestationType: 'none', supportedAlgorithmIDs: [-7], authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' } });
    current.data.registration = { hash: digest(options.challenge), expiresAt: Date.now() + 300_000 };
    store.saveSession(current.id, current.data);
    res.json(options);
  });
  router.post('/passkeys/register', async (req, res) => {
    const current = session(res);
    const expected = current.data.registration;
    delete current.data.registration;
    store.saveSession(current.id, current.data);
    if (!expected || expected.expiresAt < Date.now()) throw new HttpError(409, 'challenge_expired', 'Request fresh passkey registration options.');
    let verification;
    try {
      verification = await verifyRegistrationResponse({ response: req.body as RegistrationResponseJSON, expectedChallenge: challenge => digest(challenge) === expected.hash, expectedOrigin: config.origin, expectedRPID: config.rpId, requireUserVerification: true, supportedAlgorithmIDs: [-7] });
    } catch { throw new HttpError(400, 'invalid_registration', 'The passkey registration did not verify.'); }
    if (!verification.verified) throw new HttpError(400, 'invalid_registration', 'The passkey registration did not verify.');
    const credential = verification.registrationInfo.credential;
    current.data.credential = { id: credential.id, publicKey: Buffer.from(credential.publicKey).toString('base64url'), counter: credential.counter };
    store.saveSession(current.id, current.data);
    res.status(201).json(await provision(current, api, store, config));
  });
  router.post('/wallets/provision', async (_req, res) => res.json(await provision(session(res), api, store, config)));
  router.get('/customer-context', (_req, res) => {
    const current = session(res).data;
    if (!current.customerId || !current.credential || !current.wallets) throw new HttpError(409, 'registration_required', 'Register and provision first.');
    res.attachment('customer-context.json').json({ customerId: current.customerId, credential: current.credential, wallets: current.wallets, passkeyPublicKey: current.passkeyPublicKey, rpId: config.rpId, origin: config.origin });
  });
  return router;
}
