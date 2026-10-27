---
name: shiga-wallet-integration
description: Use when integrating Shiga Wallet Infrastructure into an app or backend — creating customers, registering passkeys, provisioning wallets, receiving deposits, sending payments, verifying webhooks, or handling its API errors and retries.
---

# Shiga Wallet Infrastructure integration

## Overview

Wallet Infrastructure gives each of your customers passkey-secured wallets on EVM networks, Bitcoin, Spark, Solana, Tron and TON. An API key alone never moves funds: every payment is approved with the customer's passkey.

The documentation is the source of truth. Before writing code for an area, read its page as Markdown, and never invent endpoints, fields, events or error codes.

| Need                          | Fetch                                                               |
| ----------------------------- | ------------------------------------------------------------------- |
| Index of every page           | `https://docs.wallet.shiga.io/llms.txt`                             |
| One page as Markdown          | `https://docs.wallet.shiga.io/llms.mdx/docs/<page path>/content.md` |
| Everything, including the API | `https://docs.wallet.shiga.io/llms-full.txt`                        |
| OpenAPI spec                  | `https://docs.wallet.shiga.io/openapi.json`                         |

Pages by task (prefix each with `/llms.mdx/docs/guides/` and suffix `/content.md`):

| Task                                     | Page path                          |
| ---------------------------------------- | ---------------------------------- |
| End-to-end flow                          | `platform/integration-walkthrough` |
| API keys, scopes, `x-customer-id`        | `platform/authentication`          |
| Passkeys and wallets                     | `wallets/creating-wallets`         |
| Deposits                                 | `wallets/receiving-deposits`       |
| Sending, both signing paths              | `wallets/sending`                  |
| Webhook setup and verification           | `notifications/setup`              |
| Event names                              | `notifications/events`             |
| Retries, timeouts, duplicates            | `platform/reliability`             |
| Networks, assets, contracts and decimals | `support/networks-and-assets`      |
| Error codes and rate limits              | `support/errors-and-limits`        |

Request and response bodies, including each event's `data`, come from the OpenAPI spec. Look up the exact operation and schema there before writing a request or parsing a response.

## Architecture

| Part                  | Does                                                                    |
| --------------------- | ----------------------------------------------------------------------- |
| Your app (browser)    | Registers the customer's passkey and asks them to approve each payment. |
| Your server           | Holds the API key, calls the API, keeps your own records.               |
| Your webhook endpoint | Verifies, deduplicates and records notifications.                       |

Never put the API key in browser or mobile code. Read it from an environment variable such as `SHIGA_API_KEY`, and the base URL from `SHIGA_API_URL`.

## Request basics

| Header            | Value                                                                      |
| ----------------- | -------------------------------------------------------------------------- |
| `Authorization`   | `Bearer sk_test_...` (test project) or `Bearer sk_live_...` (live project) |
| `x-customer-id`   | The customer `id` from Create customer, on every per-customer request.     |
| `Idempotency-Key` | Required on Create payment (payment links); reuse the same key on retry.   |

A send on Bitcoin, Spark, Solana, Tron or TON has no `Idempotency-Key`: your integer `transactionId` identifies it, so persist it before submitting and reuse it, with the same details, on any retry within 24 hours. Each of those networks carries one asset (see the networks page), so `networkConfig` stays `{}` except on Solana and TON.

Errors share one shape: `code`, `status`, `title`, `detail`, `category`, `request_id`. Branch on `code`, show `detail`, log `request_id`.

## Integration order

1. **Create the customer** (`POST /v1/customers`). Store its `id`.
2. **Register a passkey** with WebAuthn, your domain as the relying party, ES256. Verify it on your server and send `credentialId`, `credentialPublicKey` (the COSE key from the verified registration, base64url, not the browser's `publicKey`), `rpId` and `origins`.
3. **Provision wallets** (`POST /v1/wallets/provision`). Safe to retry: existing wallets return `already_exists`.
4. **Receive.** Show the address. Credit only on `deposit.confirmed`, never on `deposit.detected`.
5. **Send.** Quote, have the customer approve with their passkey, submit. Read the Sending Payments page first: EVM and the other networks sign differently.
6. **Reconcile.** A payment is paid only at status `confirmed` (`transaction.success`).

## Sending: the two signing paths

| `moduleId`                                  | Flow                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `evm_erc4337`                               | Prepare userOp → passkey signs the `userOpHash` → Submit userOp signature. `expectedChallenge` is base64url of the hash bytes. |
| `bitcoin`, `spark`, `solana`, `tron`, `ton` | Build the transfer challenge → passkey approves it → Submit transaction with a stable integer `transactionId`.                 |

The non-EVM challenge is the base64url SHA-256 of canonical JSON (keys sorted at every level, no spaces) of `{ entityKey, moduleId, txParams }` (`entityKey` is the wallet's field of that name in List wallets), where `txParams` drops `selectedPayment` and keeps only `tokenMint` or `tokenRoot` in `networkConfig`. Copy `transferChallenge` from the Sending Payments page exactly; do not reimplement it.

## Webhooks

Verify `x-signature` (`t=<timestamp>,v1=<hex HMAC-SHA256 of "<timestamp>.<raw body>">`) against the raw body with a timing-safe compare, reject events older than 5 minutes, skip any `x-idempotency-key` already processed, store the event, respond `2xx`, then process. Delivery is at least once and unordered.

Mount the webhook route with a raw body parser before any global JSON parser. Respond `5xx` only when your own store failed: `5xx`, `408` and `429` are retried (up to 15 attempts, backoff capped at 1 hour), while any other `3xx` or `4xx` stops delivery for good. Subscribe by exact event name; wildcards are refused.

## Common mistakes

| Mistake                                          | Do instead                                                  |
| ------------------------------------------------ | ----------------------------------------------------------- |
| Crediting on `deposit.detected` or `submitted`   | Credit on `deposit.confirmed`; settle on `confirmed`.       |
| Retrying after a timeout                         | Read List transactions first; a timeout is not a failure.   |
| Resubmitting a swap or bridge                    | Never; read Get bridge or List transactions.                |
| Sending the hash as text as the EVM challenge    | base64url of the `userOpHash` bytes.                        |
| Parsing the webhook body before verifying        | Verify against the raw bytes, then parse.                   |
| Missing `x-customer-id` (`404 wallet_not_found`) | Send it on every per-customer request.                      |
| Retrying `429` immediately                       | Back off with increasing delays; there is no `Retry-After`. |
| Using an `sk_live_` key before verification      | Build on `sk_test_`; live needs a verified business.        |

## Working samples

Runnable TypeScript for each step is in the quickstart repository, `https://github.com/Shiga-Digital/Shiga---wallet-infrastructure-quickstart`. Read the matching sample before writing the same step: use the local folder when working inside that repository, and otherwise read it on GitHub at `<repository>/tree/main/<folder>`.

| Step                                     | Folder                   |
| ---------------------------------------- | ------------------------ |
| Customer, ES256 passkey, provisioning    | `01-passkey-and-wallets` |
| Quote, passkey approval, submit, confirm | `02-send-payment`        |
| Webhook verification and deduplication   | `03-webhook-consumer`    |
| Payment links                            | `04-payment-link`        |
| The whole journey in one app             | `quickstart`             |

Before going live, work through the Go-Live Checklist page.
