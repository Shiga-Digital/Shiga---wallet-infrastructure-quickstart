# 01 - Passkey registration and wallets

Runnable companion to [Integration Walkthrough](https://github.com/Shiga-Digital/Wallet-micro-service-docs/blob/main/content/docs/guides/platform/integration-walkthrough.mdx).

## Run

Use Node.js 24.13+ in the Node 24 series. Run commands from this sample folder; it can also be copied out and run independently.

```sh
cp .env.example .env
npm install
npm run dev
```

Edit .env before starting. In PowerShell use Copy-Item .env.example .env and npm.cmd if npm.ps1 is blocked. Checks: npm run format:check, npm run typecheck, npm run lint, npm test. Use npm run format or npm run lint:fix to apply fixes. Tests use local requests and synthetic credentials, with no real API calls.

## Try it

Set SHIGA_API_KEY to your pilot key. Leave RP_ID=localhost and ORIGIN=http://localhost:3000 for development. Open http://localhost:3000.

1. Enter your customer reference and create the customer.
2. Register a passkey when the browser prompts. The server requires ES256 and user verification, checks the one-time challenge, RP id and origin, and extracts the verified COSE key.
3. Inspect the wallet addresses. Each module reports created, already_exists or failed. EVM deployments may continue asynchronously; an API response alone does not establish readiness to send.
4. Retry wallet provisioning if a module failed; this uses the verified credential stored on the server.
5. Refresh balances after funding the address. Only a confirmed deposit is final.

Save public customer context downloads customer-context.json for sample 02. It contains public credential metadata and wallet addresses. Stop this server before starting 02 at the same origin. You can instead supply 02 with the same JSON shape from your own server records.

## How it was integrated

server/customers.ts calls POST /v1/customers. server/passkeys.ts verifies WebAuthn registration with @simplewebauthn/server and calls POST /v1/wallets/provision. The browser's publicKey export is not used as a COSE key. Requests derive x-customer-id from an HttpOnly session.

SQLite stores public credential metadata, counters, customer/wallet records and hashes of session tokens and registration challenges. Versioned writes reject stale concurrent changes. Failed provisioning retains the credential for a safe provision retry. Changing RP_ID or ORIGIN after registration requires a new credential.

## Change log

- 2026-10-26: Initial runnable registration and provisioning example with signed WebAuthn fixtures and session isolation checks.

- 2026-10-26: Added standalone Prettier formatting and ESLint configuration checks.
