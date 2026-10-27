# 03 - Webhook consumer

Runnable companion to [Setup and Verification](https://github.com/Shiga-Digital/Wallet-micro-service-docs/blob/main/content/docs/guides/notifications/setup.mdx).

## Run

Use Node.js 24.13+ in the Node 24 series. Run commands from this sample folder; it can also be copied out and run independently.

```sh
cp .env.example .env
npm install
npm run dev
```

Edit .env before starting. In PowerShell use Copy-Item .env.example .env and npm.cmd if npm.ps1 is blocked. Checks: npm run format:check, npm run typecheck, npm run lint, npm test. Use npm run format or npm run lint:fix to apply fixes. Tests use local requests and synthetic credentials, with no real API calls.

## Configure and receive

Only WEBHOOK_SECRET is required; this sample makes no outbound API requests. PORT defaults to 3003 and ORIGIN to http://localhost:3003.

1. Expose the loopback port through your public HTTPS tunnel.
2. Register https://your-public-host/webhooks/wallet through the API or dashboard. Wallet Infrastructure refuses private/loopback callback URLs.
3. Set WEBHOOK_SECRET to that endpoint's secret, shown once at registration, then restart.
4. Subscribe to exact names: for example deposit.detected, deposit.confirmed, transaction.pending, transaction.success and transaction.failed. Wildcards are not accepted. Do not subscribe this example to recovery events.
5. Trigger a test event. A verified event is committed to .data/sample.sqlite before returning 200.

The callback is authenticated independently of the local Host/Origin guard. GET /health is local and requires Host: localhost:3003. Route the tunnel to the callback path.

## How it was integrated

The callback mounts express.raw before JSON parsing, refuses compressed bodies and limits size. Verification checks exact bytes using HMAC-SHA256 and a constant-time comparison. The signed timestamp must equal x-timestamp and be within five minutes. Signed event id/type must match their headers.

A database uniqueness constraint deduplicates event_id atomically. Duplicates return 200; conflicting bodies for one id are rejected. Storage failures return 500 for retry. The worker resumes pending rows after restart; its example side effect is an observation row committed in the same transaction as the processed marker. Failed processing rolls back.

Only envelope metadata and allowlisted primitive business fields are stored. Nested/unknown fields and one-time tokens are discarded. Secrets and raw request bodies are not stored. Extend the allowlist for your public business data; external side effects need their own durable idempotency boundary.

Inspect inbox and observations using a SQLite client. There is no event-list HTTP endpoint. Observations record events without crediting balances. Delivery order is not guaranteed; reconcile the API when events disagree.

## Change log

- 2026-10-26: Initial raw-body verification, timestamp checks, persistent atomic deduplication and crash recovery example.

- 2026-10-26: Added standalone Prettier formatting and ESLint configuration checks.
