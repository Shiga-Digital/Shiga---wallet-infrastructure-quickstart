# 04 - Payment links

Runnable companion to [Creating a Payment](https://github.com/Shiga-Digital/Wallet-micro-service-docs/blob/main/content/docs/guides/payment-links/creating-a-payment.mdx).

## Run

Use Node.js 24.13+ in the Node 24 series. Run commands from this sample folder; it can also be copied out and run independently.

```sh
cp .env.example .env
npm install
npm run dev
```

Edit .env before starting. In PowerShell use Copy-Item .env.example .env and npm.cmd if npm.ps1 is blocked. Checks: npm run format:check, npm run typecheck, npm run lint, npm test. Use npm run format or npm run lint:fix to apply fixes. Tests use local requests and synthetic credentials, with no real API calls.

## Configure

Set SHIGA_API_KEY to an sk_test_ key with payment_links:write and payment_links:read. Your business needs a default payment-links project, configured in the dashboard; otherwise the API may return 409. PORT defaults to 3004 and ORIGIN to http://localhost:3004.

This backend-only loopback service exposes POST /api/payment-links and GET /api/payment-links/{id}. Writes require an Origin header matching ORIGIN. Your API key stays on the server.

Create a payment from PowerShell:

```powershell
$paymentBody = @{
  reference = 'invoice-001'
  destinations = @{
    evm = @{
      asset = 'USDT'
      amount = '1.5'
      destinationAddress = '<your-settlement-address>'
    }
  }
} | ConvertTo-Json -Depth 5
$payment = Invoke-RestMethod -Uri 'http://localhost:3004/api/payment-links' -Method Post -ContentType 'application/json' -Headers @{ Origin = 'http://localhost:3004'; 'Idempotency-Key' = 'invoice-001-attempt-1' } -Body $paymentBody
$payment
Invoke-RestMethod -Uri ('http://localhost:3004/api/payment-links/' + $payment.id)
```

Choose a key once per payment, keep it in your records, and reuse the same key and body on retry. A new key creates a new payment. Replace the destination with a real network-valid address.

## How it was integrated

Creation validates families/positive display-unit amounts and forwards Idempotency-Key to POST /v1/payments. Supported families are evm, bitcoin, spark, solana, tron and ton; one evm entry covers all supported EVM networks.

Tracking reads GET /v1/payments/{id}, preserving addresses, attempts and held-fund information. SQLite ownership records limit reads to payments created by this example. It represents one local operator; a hosted app supplies authenticated user/business ownership.

Share the receiving addresses. AWAITING_PAYMENT, FULFILLED, EXPIRED and CANCELLED are payment states. FULFILLED may still have an attempt awaiting approval: inspect attempts before assuming settlement is complete. Register exact payment event names on the payment-links project and process them with the webhook consumer.

## Change log

- 2026-10-26: Initial backend-only payment creation, stable idempotency and status tracking sample.

- 2026-10-26: Added standalone Prettier formatting and ESLint configuration checks.
