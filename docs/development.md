# Developing the samples

## How it was integrated

npm workspaces provide root-level convenience. Every sample also has its own manifest, lockfile, TypeScript/lint configuration, tests, server sources and any browser assets. There is no shared runtime package or SDK.

Equivalent modules are duplicated deliberately. node scripts/check-copies.mjs identifies copies that must remain identical. npm run check runs consistency, typecheck, lint and every workspace's tests.

npm run check:standalone copies each example into a guarded temporary directory outside the repo, excluding .env, .data and node_modules. It performs npm ci, typecheck and tests from that folder's own lockfile. Cleanup is restricted to its generated temporary directory.

Tests use actual synthetic ES256 WebAuthn registrations/assertions. They cover challenge/origin failures, concurrent approval and delayed-session races, quote/sign asset consistency, API headers/error data, backend challenge vectors, raw-byte HMAC and timestamps, duplicate delivery, disk restart, transactional rollback and payment ownership. No test calls pilot.

Local API routes enforce Host/Origin checks. The independently HMAC-authenticated webhook is mounted before JSON parsing. Browser assets, including the WebAuthn bundle, are served locally under a restrictive content security policy.

Keep .env and .data out of Git. Keep runtime credentials server-side, add no seed/private-key exports and update the matching sample README when its integration changes. Independent code review approved the implementation after the recorded regressions. Before publishing, complete pilot validation.

## Change log

- 2026-10-26: Initial five independently runnable samples, consistency gates and review regression coverage.
