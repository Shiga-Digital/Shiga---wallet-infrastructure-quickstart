# API contracts

## How it was integrated

The baseline is wallet-infrastructure main at ac35e1b35a87dc1e32b9c9e489561aa9efb193ce, verified against its work-SSH remote on 2026-10-26. The documentation guides/OpenAPI were cross-checked with api-gateway, signing-gateway transaction binding and webhook-fanout signing. No treasury or delegate endpoints are used.

| Request | Contract |
| --- | --- |
| POST /v1/customers | reference; store data.id |
| POST /v1/wallets/provision | x-customer-id; passkeyRegistration: credentialId, base64url COSE credentialPublicKey, rpId, origins |
| GET /v1/wallets/balances | customerId query and customer header |
| POST /v1/quotes | moduleId, txParams: chain, display-unit amount, recipientAddress, token; sender resolved by API |
| POST /v1/userops/prepare | chain, token, to, amount, stored safeAddress, passkeyPublicKey |
| POST /v1/userops/{hash}/signatures | passkeyPublicKey, passkeyData; customer header |
| POST /v1/transactions | Non-EVM moduleId, exact prepared txParams, passkeyData; customer header |
| GET /v1/transactions | Paginate by cursor; match reference and customerId; preserve outcomeUndetermined |
| POST /v1/payments | reference, destinations by family, required stable Idempotency-Key |
| GET /v1/payments/{id} | Preserve payment state and settlement attempts |

Successful envelopes are { data, status, success: true }; the server unwraps data. Errors retain a safe code and request_id without exposing arbitrary upstream detail.

### Passkeys and intent binding

Registration uses ES256 and the verified COSE credential, not the browser's SPKI publicKey field. Verification requires the server-configured RP id, exact origin, challenge and user verification. Session tokens and registration challenges are stored as SHA-256 hashes; private passkey material stays on the device.

For EVM, decode the 32 userOpHash hex bytes and encode those bytes as base64url. Encoding the printable hash text produces a different challenge.

For non-EVM, hash recursively key-sorted JSON of { entityKey, moduleId, txParams }, where entityKey is biz:<businessId>:proj:<projectId>:cust:<customerId>. Drop selectedPayment. Within networkConfig retain only tokenMint/tokenRoot; provider URLs and gas infrastructure are server-owned. Retain transactionId, amount and destination exactly. Encode the SHA-256 digest as base64url. Golden-vector tests use the backend enclave vector as an independent expected value.

Normalize asset selection before quoting. Bitcoin/Spark use BTC; this example uses default USDT on Tron. A custom Solana/TON asset requires its explicit tokenMint/tokenRoot selector. The normalized asset is shared by the quoted and signed intent. Cross-module or inconsistent selectors are refused.

Approvals are consumed before asynchronous verification/submission. The sample verifies the assertion, then the infrastructure verifies it again. Session writes use revision compare-and-swap so a delayed quote/status/provision response cannot restore old approval state. A submission timeout means unknown outcome; a failed record with outcomeUndetermined does not prove no transfer occurred.

### Notifications

Signatures are hex HMAC-SHA256(secret, timestamp + '.' + exact raw body), with header t=<seconds>,v1=<hex>. Signed time must equal x-timestamp; x-idempotency-key/x-event-type must equal signed event_id/event_type.

A unique SQLite event id makes deduplication atomic. Commit precedes 200. Acknowledged rows survive restart and are projected into observations transactionally. Only allowlisted public business fields are persisted. Observations do not credit balances or settle money. Quickstart authorizes payment events by local payment ownership, even when customer_id is absent.

An in-process approval marker protects verification/submission from unrelated session mutations. After a process interruption, a persisted submitting state has no active marker and is recovered as uncertain on session loading. It stays blocked until confirmed or definitive-failure reconciliation; restarting never authorizes a resend.

## Change log

- 2026-10-26: Verified main contracts, exact challenge vectors, revisioned state and durable webhook processing.
