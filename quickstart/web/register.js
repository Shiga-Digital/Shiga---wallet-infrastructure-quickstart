import { api } from './common.js';
export async function register() {
  const options = await api('/api/passkeys/options', {});
  const registration = await window.SimpleWebAuthnBrowser.startRegistration({ optionsJSON: options });
  return api('/api/passkeys/register', registration);
}
