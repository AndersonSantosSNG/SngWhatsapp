import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

describe('api', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetch).mockReset();
  });

  it('usa o cookie HttpOnly da mesma origem', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true }),
    });
    await api('/tickets');
    expect(fetch).toHaveBeenCalledWith(
      '/api/tickets',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('dispara evento quando a sessão expira', async () => {
    const listener = vi.fn();
    window.addEventListener('session-expired', listener, { once: true });
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Sessão expirada.' }),
    });
    await expect(api('/tickets')).rejects.toThrow('Sessão expirada.');
    expect(listener).toHaveBeenCalled();
  });
});
