import { api } from './common.js';
export function hashToChallenge(hash) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('Expected a 32-byte userOpHash.');
  const bytes = Uint8Array.from(hash.slice(2).match(/../g), (value) => parseInt(value, 16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
export async function approve(prepared) {
  if (prepared.userOpHash && hashToChallenge(prepared.userOpHash) !== prepared.options.challenge)
    throw new Error('The userOp hash and challenge do not match.');
  const assertion = await window.SimpleWebAuthnBrowser.startAuthentication({
    optionsJSON: prepared.options,
  });
  return api('/api/payments/approve', { paymentId: prepared.paymentId, assertion });
}
