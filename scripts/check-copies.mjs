import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const staged = process.argv.slice(2).includes('--staged');
function readSource(folder, file) {
  return staged
    ? execFileSync('git', ['show', ':' + folder + '/' + file], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    : readFileSync(resolve(root, folder, file), 'utf8');
}
const all = [
  '01-passkey-and-wallets',
  '02-send-payment',
  '03-webhook-consumer',
  '04-payment-link',
  'quickstart',
];
const browsers = [all[0], all[1], all[4]];
const groups = [
  [
    all,
    [
      '.prettierrc.json',
      '.prettierignore',
      'eslint.config.mjs',
      '.gitignore',
      'server/api.ts',
      'server/config.ts',
      'server/http.ts',
      'server/store.ts',
      'tests/api.test.ts',
    ],
  ],
  [browsers, ['server/session.ts', 'server/types.ts', 'web/common.js', 'tests/authenticator.ts']],
  [
    [all[0], all[4]],
    ['server/customers.ts', 'server/passkeys.ts', 'web/register.js', 'tests/onboarding.test.ts'],
  ],
  [
    [all[1], all[4]],
    [
      'server/quote.ts',
      'server/payments.ts',
      'server/status.ts',
      'server/evm.ts',
      'server/other-networks.ts',
      'web/approve.js',
      'tests/payments.test.ts',
    ],
  ],
  [
    [all[2], all[4]],
    ['server/verify.ts', 'server/events.ts', 'server/webhooks.ts', 'tests/webhooks.test.ts'],
  ],
  [
    [all[3], all[4]],
    ['server/create.ts', 'server/track.ts', 'tests/payment-links.test.ts'],
  ],
];
for (const [folders, files] of groups)
  for (const file of files) {
    const expected = readSource(folders[0], file);
    for (const folder of folders.slice(1))
      if (readSource(folder, file) !== expected)
        throw new Error(
          'Keep equivalent sample modules identical: ' + folders.join(', ') + ' / ' + file,
        );
  }
console.log(
  staged
    ? 'Equivalent staged sample modules are consistent.'
    : 'Equivalent standalone modules are consistent.',
);
