import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const all = ['01-passkey-and-wallets', '02-send-payment', '03-webhook-consumer', '04-payment-link', 'quickstart'];
const browsers = [all[0], all[1], all[4]];
const groups = [
  [all, ['.gitignore', 'server/api.ts', 'server/config.ts', 'server/http.ts', 'server/store.ts', 'tests/api.test.ts']],
  [browsers, ['server/session.ts', 'server/types.ts', 'web/common.js', 'tests/authenticator.ts']],
  [[all[0], all[4]], ['server/customers.ts', 'server/passkeys.ts', 'web/register.js', 'tests/onboarding.test.ts']],
  [[all[1], all[4]], ['server/quote.ts', 'server/payments.ts', 'server/status.ts', 'server/evm.ts', 'server/other-networks.ts', 'web/approve.js', 'tests/payments.test.ts']],
  [[all[2], all[4]], ['server/verify.ts', 'server/events.ts', 'server/webhooks.ts', 'tests/webhooks.test.ts']],
  [[all[3], all[4]], ['server/create.ts', 'server/track.ts', 'tests/payment-links.test.ts']],
];
for (const [folders, files] of groups) for (const file of files) {
  const expected = readFileSync(resolve(root, folders[0], file), 'utf8');
  for (const folder of folders.slice(1)) if (readFileSync(resolve(root, folder, file), 'utf8') !== expected) throw new Error('Keep equivalent sample modules identical: ' + folders.join(', ') + ' / ' + file);
}
console.log('Equivalent standalone modules are consistent.');
