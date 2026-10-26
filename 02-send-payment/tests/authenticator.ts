import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import type { Config } from '../server/config.js';

export function authenticator() {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const key = keys.publicKey.export({ format: 'jwk' });
  const x = new Uint8Array(Buffer.from(key.x!, 'base64url'));
  const y = new Uint8Array(Buffer.from(key.y!, 'base64url'));
  const publicKey = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, x],
      [-3, y],
    ]),
  );
  const idBytes = randomBytes(24);
  const id = idBytes.toString('base64url');
  const rpHash = createHash('sha256').update('localhost').digest();
  const client = (type: string, challenge: string, origin: string) =>
    Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  const metadata = { id, publicKey: Buffer.from(publicKey).toString('base64url'), counter: 0 };
  const coordinates = {
    x: '0x' + Buffer.from(x).toString('hex'),
    y: '0x' + Buffer.from(y).toString('hex'),
  };
  function register(
    challenge: string,
    origin = 'http://localhost:3000',
    verified = true,
  ): RegistrationResponseJSON {
    const length = Buffer.alloc(2);
    length.writeUInt16BE(idBytes.length);
    const authData = Buffer.concat([
      rpHash,
      Buffer.from([verified ? 0x45 : 0x41]),
      Buffer.alloc(4),
      Buffer.alloc(16),
      length,
      idBytes,
      Buffer.from(publicKey),
    ]);
    const attestation = isoCBOR.encode(
      new Map<string, string | Map<string, string> | Uint8Array>([
        ['fmt', 'none'],
        ['attStmt', new Map<string, string>()],
        ['authData', new Uint8Array(authData)],
      ]),
    );
    return {
      id,
      rawId: id,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: client('webauthn.create', challenge, origin).toString('base64url'),
        attestationObject: Buffer.from(attestation).toString('base64url'),
      },
    };
  }
  function approve(
    challenge: string,
    origin = 'http://localhost:3000',
    counter = 1,
  ): AuthenticationResponseJSON {
    const counterBytes = Buffer.alloc(4);
    counterBytes.writeUInt32BE(counter);
    const authData = Buffer.concat([rpHash, Buffer.from([5]), counterBytes]);
    const clientData = client('webauthn.get', challenge, origin);
    const signature = sign(
      'sha256',
      Buffer.concat([authData, createHash('sha256').update(clientData).digest()]),
      keys.privateKey,
    );
    return {
      id,
      rawId: id,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        authenticatorData: authData.toString('base64url'),
        clientDataJSON: clientData.toString('base64url'),
        signature: signature.toString('base64url'),
      },
    };
  }
  return { metadata, coordinates, register, approve };
}

export function customerFixture() {
  const auth = authenticator();
  const directory = mkdtempSync(join(tmpdir(), 'shiga-samples-test-'));
  const context = {
    customerId: 'c1',
    credential: auth.metadata,
    wallets: [
      { moduleId: 'evm_erc4337', chain: 'evm', address: '0x' + '12'.repeat(20), status: 'created' },
    ],
    passkeyPublicKey: auth.coordinates,
    rpId: 'localhost',
    origin: 'http://localhost:3000',
  };
  const contextFile = join(directory, 'customer-context.json');
  writeFileSync(contextFile, JSON.stringify(context));
  const config: Config = {
    apiUrl: 'https://api.pilot.shiga.io',
    apiKey: 'sk_test_fixture_only',
    webhookSecret: 'fixture-webhook-signing-key',
    port: 3000,
    origin: 'http://localhost:3000',
    rpId: 'localhost',
    databasePath: ':memory:',
    businessId: 'b1',
    projectId: 'p1',
    contextFile,
  };
  const cleanup = () => {
    const target = resolve(directory);
    if (
      !target.startsWith(resolve(tmpdir()) + sep) ||
      !basename(target).startsWith('shiga-samples-test-')
    )
      throw new Error('Unexpected test cleanup target');
    rmSync(target, { recursive: true, force: true });
  };
  return { auth, context, config, cleanup };
}
