import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { storage } from './storage';

describe('api', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetch).mockReset();
  });

  it('envia o token da sessão', async () => {
    storage.set('agentAuthToken', 'token-seguro');
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) });
    await api('/tickets');
    expect(fetch).toHaveBeenCalledWith('/api/tickets', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token-seguro' }) }));
  });

  it('dispara evento quando a sessão expira', async () => {
    storage.set('agentAuthToken', 'token');
    const listener = vi.fn();
    window.addEventListener('session-expired', listener, { once: true });
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401, headers: { get: () => 'application/json' }, json: async () => ({ error: 'Sessão expirada.' }) });
    await expect(api('/tickets')).rejects.toThrow('Sessão expirada.');
    expect(listener).toHaveBeenCalled();
  });
});
