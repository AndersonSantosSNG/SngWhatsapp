export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
  });
  const contentType = response.headers.get('content-type') || '';
  const result = contentType.includes('json') ? await response.json() : null;
  if (response.status === 401 && path !== '/auth/login') {
    window.dispatchEvent(
      new CustomEvent('session-expired', {
        detail: { message: result?.error || 'Sua sessão expirou. Entre novamente para continuar.' },
      }),
    );
  }
  if (!response.ok)
    throw new Error(result?.error || result?.details || 'Não foi possível concluir a operação.');
  return result;
}

export function sendMessage(payload) {
  return api('/panel/send-message', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function editMessage(messageId, body) {
  return api(`/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
}

export function deleteMessage(messageId) {
  return api(`/messages/${messageId}/everyone`, { method: 'DELETE' });
}
