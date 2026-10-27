# Wallet Infrastructure samples

Small, runnable TypeScript integrations for Shiga Wallet Infrastructure. Each sample follows a guide, uses the HTTP API through plain fetch, and runs independently. A browser page appears only where a passkey needs one.

| Sample                                                     | Journey                                                                | Browser |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- | ------- |
| [01-passkey-and-wallets](01-passkey-and-wallets/README.md) | Create customer, verify ES256 registration, provision wallets          | Yes     |
| [02-send-payment](02-send-payment/README.md)               | Quote, prepare, passkey approval, submit, wait for confirmation        | Yes     |
| [03-webhook-consumer](03-webhook-consumer/README.md)       | Verify raw bytes, reject stale events, durably deduplicate and process | No      |
| [04-payment-link](04-payment-link/README.md)               | Create receiving addresses with idempotency and read payment status    | No      |
| [quickstart](quickstart/README.md)                         | The complete journey in one app, including webhook observations        | Yes     |

## Start with quickstart

Install Node.js 24.13 or later in the Node 24 series and npm. The samples use Node's built-in SQLite driver. You do not need Docker, a database server, an SDK, or a frontend framework.

```sh
cd quickstart
cp .env.example .env
npm install
npm run dev
```

Edit .env before running: supply your test API key and the signing secret for your webhook endpoint. Open http://localhost:3000. In PowerShell, use Copy-Item .env.example .env; use npm.cmd if execution policy blocks npm.ps1.

The same four commands work in any numbered sample. Sample 02 also needs public metadata for an existing customer/passkey; its README explains how to supply it without depending on sample 01's source.

## Configuration

Every sample has its own .env.example. Configuration is loaded from that sample's working directory; a root .env is not loaded by workspace commands.

| Variable                             | Used for                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| SHIGA_API_URL                        | HTTPS API origin                                                                               |
| SHIGA_API_KEY                        | Your sk_test_ key, held only by the server                                                     |
| WEBHOOK_SECRET                       | The endpoint's signing secret; required by quickstart and sample 03                            |
| RP_ID / ORIGIN                       | Your relying party and exact browser origin; localhost / http://localhost:3000 for development |
| SHIGA_BUSINESS_ID / SHIGA_PROJECT_ID | The API key's tenant identifiers, needed for non-EVM transaction challenges                    |
| CUSTOMER_CONTEXT_FILE                | Sample 02's server-side public customer metadata JSON                                          |
| DATABASE_PATH                        | Local SQLite file; defaults to .data/sample.sqlite                                             |
| PORT                                 | 3000 for browser samples, 3003 for webhooks, 3004 for payment links                            |

Supply a test key with the scopes required by the sample. See the API operation's required scope in the linked reference docs. Configure a default payment-links project before using payment links. Register webhook endpoints through the API or dashboard.

Passkeys need a secure browser origin. http://localhost works for development. For HTTPS, set RP_ID and ORIGIN before registration and use a reverse proxy or tunnel to the loopback server. Keep the same origin when moving a registered credential from sample 01 to 02; run them sequentially on port 3000.

## Development

To work on all samples together:

```sh
npm install
npm run check
npm run dev
```

npm install also activates Husky. Commits format/lint staged files and check copied modules; pushes run npm run check. Use npm run format or npm run lint:fix to apply fixes. See [development tooling](docs/development.md).

The root dev command starts quickstart. You can also use npm run dev --workspace 01-passkey-and-wallets. Every folder includes its own package.json, lockfile, tests and configuration; copying just that folder to another directory remains supported.

Shared examples are copied locally, with no runtime imports from sibling folders. scripts/check-copies.mjs checks that equivalent modules stay identical. npm run check:standalone verifies clean, isolated npm installs and checks outside this workspace.

The tests use synthetic credentials and actual P-256 signatures. They do not call the API or move funds. See [integration details](docs/README.md).

## Scope and status

Treasury, proposals, delegate spends, recovery and an SDK are outside this sample set.

The servers bind to 127.0.0.1 and accept test keys. Browser sessions demonstrate customer scoping; a hosted partner app supplies its own user authentication. API keys, signing secrets, .env files and runtime databases are ignored by Git. The customer-context download contains public key and wallet metadata, never a seed phrase or signing secret.
