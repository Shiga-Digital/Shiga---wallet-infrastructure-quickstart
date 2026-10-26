import { api, action, show, refreshState } from './common.js';
import { register } from './register.js';

action('balances', async () => show('balance-output', await api('/api/balances')));
action('customer-form', async () => {
  show('wallets', await api('/api/customers', { reference: document.getElementById('reference').value }));
  await refreshState();
});
action('register', async () => { await register(); await refreshState(); });
action('provision', async () => { await api('/api/wallets/provision', {}); await refreshState(); });
refreshState().catch(error => { const notice = document.getElementById('notice'); notice.dataset.error = 'true'; notice.textContent = error.message; });
