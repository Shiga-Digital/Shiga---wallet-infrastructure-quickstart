# 02 - Send a payment

Runnable companion to [Sending Payments](https://github.com/Shiga-Digital/Wallet-micro-service-docs/blob/main/content/docs/guides/wallets/sending.mdx).

## Run

Use Node.js 24.13+ in the Node 24 series. Run commands from this sample folder; it can also be copied out and run independently.

```sh
cp .env.example .env
npm install
npm run dev
```

Edit .env before starting. In PowerShell use Copy-Item .env.example .env and npm.cmd if npm.ps1 is blocked. Checks: npm run format:check, npm run typecheck, npm run lint, npm test. Use npm run format or npm run lint:fix to apply fixes. Tests use local requests and synthetic credentials, with no real API calls.

## Before starting

You need a funded, provisioned, single-signer wallet and its passkey on this device. Set SHIGA_API_KEY and CUSTOMER_CONTEXT_FILE in .env. Put public customer metadata in .data/customer-context.json:

```json
{
  "customerId": "your-customer-id",
  "credential": {
    "id": "base64url-credential-id",
    "publicKey": "base64url-verified-COSE-key",
    "counter": 0
  },
  "wallets": [
    {
      "moduleId": "evm_erc4337",
      "chain": "evm",
      "address": "0x-your-provisioned-safe-address",
      "status": "created"
    }
  ],
  "passkeyPublicKey": { "x": "0x-32-byte-coordinate", "y": "0x-32-byte-coordinate" },
  "rpId": "localhost",
  "origin": "http://localhost:3000"
}
```

Use your server records or sample 01's public context export. This folder imports no sample 01 source. The origin and RP id must match the enrolled credential. To move from 01 to 02, stop 01 and keep port 3000 and the same browser origin.

For non-EVM networks also set SHIGA_BUSINESS_ID and SHIGA_PROJECT_ID to this API key's identifiers. The wallet-binding challenge includes them. No account index, RPC endpoint, enclave credential or seed is supplied.

## Try it

1. Open http://localhost:3000 and inspect the customer/addresses.
2. Choose the module, chain, asset, recipient and display-unit amount. Use a real network-valid recipient. EVM supports usdt/xaut with at most six decimals; Bitcoin/Spark use BTC. Tron uses default USDT.
3. Request the quote and inspect its fees and maximum sendable amount.
4. Prepare that quote and inspect the recipient/amount returned by the server.
5. Approve with the passkey. The page polls for up to two minutes; only confirmed means complete.
6. If still pending, use Check confirmation or reconcile webhook events. Do not resend because polling timed out.

For a custom Solana asset, set tokenMint; for a custom TON asset, set tokenRoot. Those selectors are used in both the quote and signed intent. Leave them blank for default USDT. A custom Asset value without a matching selector is rejected. Selectors on unrelated modules are rejected too.

## How it was integrated

The quote route stores an expiring, normalized intent. Preparation accepts only its quote id. EVM preparation uses the stored Safe and P-256 coordinates; the challenge is the base64url encoding of the 32 userOpHash bytes. Non-EVM preparation binds the customer wallet, module, amount, destination, asset and a persistent timestamp-based transactionId. Golden-vector tests match the backend enclave contract.

The server verifies the actual assertion using the stored COSE key, exact origin and RP id before forwarding it. Approval is consumed before asynchronous verification. Compare-and-swap session writes reject stale concurrent snapshots, including delayed quotes. Unknown submission outcomes stay blocked until a confirmed or definitively failed registry transaction is found; outcomeUndetermined never unlocks a resend.

Status reconciliation paginates the registry and matches customerId and the exact reference. A signed quorum or returned transaction hash is not confirmation. The sample reports an error if the wallet requires more than one signer.

## Change log

- 2026-10-26: Initial intent-bound transfer example with real P-256 assertions, race/replay regressions and confirmation handling.

- 2026-10-26: Added standalone Prettier formatting and ESLint configuration checks.
