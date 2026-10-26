# Developing the samples

## How it was integrated

npm workspaces provide root-level convenience. Every sample also has its own manifest, lockfile, TypeScript/lint configuration, tests, server sources and any browser assets. There is no shared runtime package or SDK.

Equivalent modules are duplicated deliberately. node scripts/check-copies.mjs identifies copies that must remain identical. npm run check runs copy consistency, Prettier format checks, typecheck, ESLint and every workspace's tests.

npm run check:standalone copies each example into a guarded temporary directory outside the repo, excluding .env, .data and node_modules. It performs npm ci, formatting checks, typecheck, lint and tests from that folder's own lockfile. Cleanup is restricted to its generated temporary directory.

Tests use actual synthetic ES256 WebAuthn registrations/assertions. They cover challenge/origin failures, concurrent approval and delayed-session races, quote/sign asset consistency, API headers/error data, backend challenge vectors, raw-byte HMAC and timestamps, duplicate delivery, disk restart, transactional rollback and payment ownership. No test calls pilot.

Local API routes enforce Host/Origin checks. The independently HMAC-authenticated webhook is mounted before JSON parsing. Browser assets, including the WebAuthn bundle, are served locally under a restrictive content security policy.

Keep .env and .data out of Git. Keep runtime credentials server-side, add no seed/private-key exports and update the matching sample README when its integration changes. Independent code review approved the implementation after the recorded regressions. Before publishing, complete pilot validation.

## Formatting, linting and Git hooks

Run npm install at the repository root to install the pinned tooling and activate Husky through the prepare script. This sets the local Git hooks path to .husky/_. The generated dispatcher files are ignored; only the maintained hooks are tracked. Standalone samples have their own formatting and lint dependencies/configuration, but do not install repository Git hooks.

| Command              | Purpose                                                         |
| -------------------- | --------------------------------------------------------------- |
| npm run format       | Format supported source, configuration and documentation files  |
| npm run format:check | Check formatting without editing files                          |
| npm run lint         | Lint root scripts/configuration and every sample                |
| npm run lint:fix     | Apply ESLint fixes                                              |
| npm run check:copies | Check equivalent sample modules/configurations remain identical |
| npm run check        | Run all formatting, lint, type and test gates                   |

Each sample exposes the same format, format:check, lint and lint:fix commands from its own directory. Run the root command when updating duplicated modules so every copy receives identical formatting.

Prettier uses single quotes, semicolons, trailing commas, a 100-column print width and LF endings. Generated lockfiles, dependencies, runtime databases, coverage and secrets are ignored. eslint-config-prettier disables lint rules that would conflict with the formatter. ESLint uses separate browser and Node globals, retains strict TypeScript checks, and covers its own configuration files as well as application/test sources.

The pre-commit hook runs lint-staged: it formats staged supported files and fixes/lints staged JavaScript/TypeScript using the nearest ESLint configuration. lint-staged preserves unrelated unstaged changes and stages its own fixes. The hook then compares equivalent sample modules from the Git index, so it validates the exact files being committed independently of unstaged edits. A failed check blocks the commit. The pre-push hook runs npm run check; a failed gate blocks the push. Both hooks run from the Git repository root, including commits invoked inside a sample directory.

.gitattributes and .editorconfig keep files on LF, including POSIX hook scripts on Windows. Use npm.cmd from PowerShell if execution policy blocks npm.ps1; Husky invokes npm from Git's shell. In CI, HUSKY=0 skips hook installation while npm run check remains available as the explicit validation command.

## Change log

- 2026-10-26: Initial five independently runnable samples, consistency gates and review regression coverage.

- 2026-10-26: Added pinned Prettier, repository-wide ESLint, standalone formatter configs and Husky staged-file/pre-push checks.
