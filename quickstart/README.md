# Quickstart - One customer, end to end

Runnable companion to [Integration Walkthrough](https://github.com/Shiga-Digital/Wallet-micro-service-docs/blob/main/content/docs/guides/platform/integration-walkthrough.mdx). Includes the flows from samples 01-04 as local modules.

## Run

Use Node.js 24.13+ in the Node 24 series. Run commands from this sample folder; it can also be copied out and run independently.

```sh
cp .env.example .env
npm install
npm run dev
```

Edit .env before starting. In PowerShell use Copy-Item .env.example .env and npm.cmd if npm.ps1 is blocked. Checks: npm run format:check, npm run typecheck, npm run lint, npm test. Use npm run format or npm run lint:fix to apply fixes. Tests use local requests and synthetic credentials, with no real API calls.

## Configure

Set SHIGA_API_KEY to your pilot key and WEBHOOK_SECRET to your registered endpoint's signing secret. Keep RP_ID=localhost, ORIGIN=http://localhost:3000 and PORT=3000 for local passkeys. Non-EVM sends need SHIGA_BUSINESS_ID and SHIGA_PROJECT_ID. Only the payment-link section needs a default payment-links project.

Open http://localhost:3000:

1. Create a customer and register a passkey.
2. Inspect the wallet addresses and per-module failures; retry provisioning if needed.
3. Fund a receiving address and refresh balances. Only deposit.confirmed is final.
4. Quote, inspect, prepare and approve a payment with the passkey.
5. Watch status: only confirmed means complete. Polling lasts two minutes, with manual refresh afterwards.
6. Optionally create a payment link, share its addresses and refresh payment/attempt status.
7. Expose /webhooks/wallet through a public HTTPS tunnel, subscribe to exact event names and refresh webhook observations.

Wallet/transfer events belong to the API key's project; payment events belong to the default payment-links project. Each endpoint has its own secret: this app accepts one configured endpoint secret. Run sample 03 as a second receiver if the two projects' endpoints have different secrets. Update endpoint subscriptions instead of duplicating the same URL/events.

## How it was integrated

The Express app mounts customer, passkey, quote, preparation/approval, status, payment-link and webhook routes. Modules match the standalone copies with no sibling runtime imports. Browser pages use plain HTML/JavaScript and a locally served @simplewebauthn/browser bundle.

An HttpOnly, SameSite session binds customer ids, public credentials, quotes and one-time approvals. Versioned SQLite writes refuse stale asynchronous updates. The raw-body webhook callback durably stores verified events before acknowledgement; a worker projects observations. The event view requires the current customer for wallet/transfer events and explicit payment ownership for payment events. Payment-link idempotency keys are namespaced by session before forwarding.

The .data database preserves sessions, counters, transaction sequence numbers, payment ownership and webhook state across restarts. Sessions expire after one hour. Retain your own application's customer and transfer records for a real integration. Reconcile outstanding transfers before resetting local data.

## Change log

- 2026-10-26: Initial end-to-end onboarding, balance/deposit view, passkey-approved sends, payment links and durable webhooks.

- 2026-10-26: Added standalone Prettier formatting and ESLint configuration checks.
