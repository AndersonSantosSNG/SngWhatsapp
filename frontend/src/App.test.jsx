import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { socket } = vi.hoisted(() => ({
  socket: {
    auth: {},
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock('socket.io-client', () => ({ io: () => socket }));
vi.mock('./services/api', () => ({
  api: vi.fn().mockRejectedValue(new Error('Sem sessão')),
  sendMessage: vi.fn(),
}));

import App, { readPersistedUnread } from './App';

describe('conexão inicial com o servidor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockReset();
    localStorage.clear();
  });

  afterEach(() => vi.useRealTimers());

  it('mantém o loading e tenta novamente depois de um segundo', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('Servidor offline'))
      .mockResolvedValueOnce({ ok: true });

    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Conectando ao servidor...');
    await act(async () => {});
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/health', { cache: 'no-store' });
    expect(screen.getByRole('heading', { name: 'Entrar como agente' })).toBeVisible();
  });
});

describe('persistencia de mensagens nao lidas', () => {
  it('restaura somente notificacoes validas do agente atual', () => {
    localStorage.setItem(
      'unreadByChat:agent-1',
      JSON.stringify({
        chat1: { count: 2, firstMessageId: 'message-1' },
        invalid: { count: 0, firstMessageId: 'message-2' },
      }),
    );
    localStorage.setItem(
      'unreadByChat:agent-2',
      JSON.stringify({ chat2: { count: 4, firstMessageId: 'message-3' } }),
    );

    expect(readPersistedUnread('agent-1')).toEqual({
      chat1: { count: 2, firstMessageId: 'message-1' },
    });
    expect(readPersistedUnread('agent-2')).toEqual({
      chat2: { count: 4, firstMessageId: 'message-3' },
    });
  });

  it('ignora dados corrompidos', () => {
    localStorage.setItem('unreadByChat:agent-1', '{invalido');
    expect(readPersistedUnread('agent-1')).toEqual({});
  });
});
