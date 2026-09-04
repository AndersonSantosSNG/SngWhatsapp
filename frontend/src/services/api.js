import { storage } from './storage';

export async function api(path, options = {}) {
  const token = storage.get('agentAuthToken');
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const contentType = response.headers.get('content-type') || '';
  const result = contentType.includes('json') ? await response.json() : null;
  if (response.status === 401 && token) {
    window.dispatchEvent(new CustomEvent('session-expired', {
      detail: { message: result?.error || 'Sua sessão expirou. Entre novamente para continuar.' }
    }));
  }
  if (!response.ok) throw new Error(result?.error || result?.details || 'Não foi possível concluir a operação.');
  return result;
}

export function sendMessage(payload) {
  return api('/panel/send-message', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
