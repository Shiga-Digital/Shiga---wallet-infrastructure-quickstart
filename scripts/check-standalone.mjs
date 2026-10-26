import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('..', import.meta.url));
const samples = ['01-passkey-and-wallets', '02-send-payment', '03-webhook-consumer', '04-payment-link', 'quickstart'];
const temporary = resolve(mkdtempSync(join(tmpdir(), 'shiga-standalone-')));
if (!temporary.startsWith(resolve(tmpdir()) + sep) || !basename(temporary).startsWith('shiga-standalone-')) throw new Error('Unexpected temporary directory');
try {
  for (const sample of samples) {
    const destination = join(temporary, sample);
    cpSync(resolve(root, sample), destination, { recursive: true, filter: source => !['node_modules', '.data'].includes(basename(source)) && (!basename(source).startsWith('.env') || basename(source) === '.env.example') });
    console.log('\nStandalone check: ' + sample);
    for (const args of [['ci', '--no-audit', '--no-fund'], ['run', 'typecheck'], ['test']]) {
      const command = process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : 'npm';
      const parameters = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd ' + args.join(' ')] : args;
      const result = spawnSync(command, parameters, { cwd: destination, stdio: 'inherit', env: { ...process.env, NODE_PATH: '' } });
      if (result.status !== 0) throw new Error(sample + ': npm ' + args.join(' ') + ' failed');
    }
  }
} finally { rmSync(temporary, { recursive: true, force: true }); }
console.log('\nEvery sample passed from an isolated folder.');
