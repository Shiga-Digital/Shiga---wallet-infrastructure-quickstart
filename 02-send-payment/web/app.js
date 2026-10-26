import { api, action, show, refreshState } from './common.js';
import { approve } from './approve.js';
let quote;
let prepared;

action('balances', async () => show('balance-output', await api('/api/balances')));

action('quote-form', async () => {
  const body = {
    moduleId: document.getElementById('module').value,
    chain: document.getElementById('chain').value,
    token: document.getElementById('token').value,
    amount: document.getElementById('amount').value,
    recipientAddress: document.getElementById('recipient').value,
  };
  const mint = document.getElementById('token-mint').value;
  const root = document.getElementById('token-root').value;
  if (mint) body.tokenMint = mint;
  if (root) body.tokenRoot = root;
  quote = await api('/api/payments/quote', body);
  prepared = undefined;
  show('quote-output', quote);
  document.getElementById('prepare').disabled = false;
  document.getElementById('approve').disabled = true;
});
action('prepare', async () => {
  prepared = await api('/api/payments/prepare', { quoteId: quote.id });
  show('payment-output', prepared);
  document.getElementById('prepare').disabled = true;
  document.getElementById('approve').disabled = false;
});
action('approve', async () => {
  if (!prepared) throw new Error('Prepare a payment first.');
  document.getElementById('approve').disabled = true;
  const result = await approve(prepared);
  prepared = undefined;
  show('payment-output', result);
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const update = await api('/api/payments/status');
    show('payment-output', update);
    if (['confirmed', 'failed'].includes(update.status)) return;
  }
  throw new Error(
    'Still awaiting confirmation. Use Check confirmation or reconcile with webhooks; do not resend.',
  );
});
action('status', async () => show('payment-output', await api('/api/payments/status')));
document.getElementById('module').addEventListener('change', (event) => {
  const moduleId = event.target.value;
  document.getElementById('chain').value = moduleId === 'evm_erc4337' ? 'base' : moduleId;
  document.getElementById('token').value = ['bitcoin', 'spark'].includes(moduleId) ? 'BTC' : 'usdt';
});
document.getElementById('quote-form').addEventListener('input', () => {
  quote = undefined;
  prepared = undefined;
  document.getElementById('prepare').disabled = true;
  document.getElementById('approve').disabled = true;
});
refreshState().catch((error) => {
  const notice = document.getElementById('notice');
  notice.dataset.error = 'true';
  notice.textContent = error.message;
});
