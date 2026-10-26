export async function api(path, body, headers = {}) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      (data.message ?? data.error ?? 'Request failed') +
        (data.requestId ? ' Request id: ' + data.requestId : ''),
    );
  return data;
}
export function show(id, value) {
  document.getElementById(id).textContent =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}
export function action(id, callback) {
  const element = document.getElementById(id);
  element.addEventListener(element.tagName === 'FORM' ? 'submit' : 'click', async (event) => {
    event.preventDefault();
    const button =
      element.tagName === 'FORM' ? element.querySelector('button[type="submit"]') : element;
    const notice = document.getElementById('notice');
    button.disabled = true;
    try {
      await callback();
      notice.textContent = 'Request complete. Check the result below.';
      notice.dataset.error = 'false';
    } catch (error) {
      notice.textContent = error.message;
      notice.dataset.error = 'true';
    } finally {
      if (!['prepare', 'approve'].includes(id)) button.disabled = false;
      if (['customer-form', 'register'].includes(id)) await refreshState();
    }
  });
}
export async function refreshState() {
  const state = await api('/api/state');
  show('wallets', state);
  document.getElementById('notice').textContent = state.customerId
    ? 'Customer session ready.'
    : 'Create a customer to begin.';
  const customerButton = document.getElementById('customer-form')?.querySelector('button');
  if (customerButton) customerButton.disabled = Boolean(state.customerId);
  const registerButton = document.getElementById('register');
  if (registerButton) registerButton.disabled = !state.customerId || Boolean(state.credentialId);
}
