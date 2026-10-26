# Pilot validation before publishing

Local tests do not establish a real pilot integration. These checks remain pending until a partner test key, endpoint secret and browser passkey are available.

## Onboarding and sends

- [ ] Configure the pilot URL and least-privilege pilot key in the sample's ignored .env.
- [ ] Create a customer and register an ES256 passkey on localhost or your HTTPS origin.
- [ ] Inspect each provisioned module's status and asynchronous EVM deployment result.
- [ ] Check the receiving address, fund a selected wallet and observe deposit.confirmed.
- [ ] Quote, inspect, prepare and approve an intended small transfer.
- [ ] Observe submitted/pending followed by confirmed and transaction.success.
- [ ] Repeat on each enabled non-EVM chain/asset with the correct tenant and asset selector.
- [ ] Export the public context, stop sample 01 and run sample 02 alone on the same origin.

## Notifications

- [ ] Register a public HTTPS callback on the correct project with exact event names; retain its secret server-side.
- [ ] Confirm a verified event is durable before acknowledgement.
- [ ] Redeliver and confirm one observation; restart and confirm pending work resumes.
- [ ] Confirm stale/tampered bodies are refused and storage failure yields a retryable response.

## Payment links

- [ ] Set the default payment-links project.
- [ ] Retry creation with the same key/body and confirm the same payment/address set.
- [ ] Pay the receiving address and observe payment status/attempts and project webhook events.
- [ ] Verify FULFILLED does not hide an attempt still awaiting settlement approval.

## Validation record

Record date, environment, sample, chain/asset, API revision and outcome. Keep non-secret customer/payment/transaction ids in access-controlled test records. Do not paste keys, endpoint secrets or assertions into this repo.

- 2026-10-26: Pilot validation pending; no real pilot credentials were supplied.
