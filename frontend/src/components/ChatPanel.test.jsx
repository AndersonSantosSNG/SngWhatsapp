import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatPanel from './ChatPanel';

const chat = {
  _id: 't1',
  phoneNumber: '5511999999999',
  whatsappId: '5511999999999@c.us',
  contactName: 'Cliente',
  status: 'pending',
};
const baseProps = {
  chat,
  unreadMarker: null,
  contactOnline: false,
  hasOlderMessages: false,
  onLoadOlder: vi.fn(),
  onFile: vi.fn(),
  onToggle: vi.fn(),
  onClose: vi.fn(),
  onBack: vi.fn(),
  onOpenImage: vi.fn(),
};

describe('ChatPanel', () => {
  it('separa mensagens por dia com rótulos relativos', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16, 15, 0));
    const messages = [
      {
        _id: 'yesterday',
        sender: 'client',
        body: 'Anterior',
        timestamp: new Date(2026, 8, 15, 18, 0),
      },
      { _id: 'today', sender: 'client', body: 'Atual', timestamp: new Date(2026, 8, 16, 14, 0) },
    ];
    render(<ChatPanel {...baseProps} messages={messages} onSend={vi.fn()} />);
    expect(screen.getByText('Ontem')).toBeVisible();
    expect(screen.getByText('Hoje')).toBeVisible();
    vi.useRealTimers();
  });

  it('envia texto e bloqueia o campo durante a requisição', async () => {
    let resolveSend;
    const onSend = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );
    render(<ChatPanel {...baseProps} messages={[]} onSend={onSend} />);
    const input = screen.getByPlaceholderText('Digite uma mensagem');
    fireEvent.change(input, { target: { value: 'Teste' } });
    fireEvent.submit(input.closest('form'));
    expect(screen.getByPlaceholderText('Enviando...')).toBeDisabled();
    resolveSend();
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Teste', undefined));
  });

  it('restaura a mensagem quando o envio falha', async () => {
    render(
      <ChatPanel
        {...baseProps}
        messages={[]}
        onSend={vi.fn().mockRejectedValue(new Error('Sem conexão'))}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Digite uma mensagem'), {
      target: { value: 'Não perder' },
    });
    fireEvent.submit(screen.getByPlaceholderText('Digite uma mensagem').closest('form'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão');
    expect(screen.getByDisplayValue('Não perder')).toBeVisible();
  });

  it('oculta comandos de envio em canal somente leitura', () => {
    render(
      <ChatPanel
        {...baseProps}
        chat={{ ...chat, whatsappId: '123@newsletter' }}
        messages={[]}
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByText('Esta conversa não permite o envio de mensagens.')).toBeVisible();
    expect(screen.queryByPlaceholderText('Digite uma mensagem')).not.toBeInTheDocument();
  });

  it('abre a janela para criar um chamado no GLPI', () => {
    render(
      <ChatPanel {...baseProps} messages={[]} onSend={vi.fn()} onCreateGlpiTicket={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chamado' }));
    expect(screen.getByRole('dialog', { name: 'Abrir chamado' })).toBeVisible();
  });

  it('abre as informações do contato ao clicar no perfil', () => {
    render(<ChatPanel {...baseProps} messages={[]} onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver informações do contato' }));
    expect(screen.getByRole('dialog', { name: 'Informações do contato' })).toBeVisible();
    expect(screen.getAllByText('(11) 99999-9999')).toHaveLength(2);
    expect(screen.getByText('5511999999999@c.us')).toBeVisible();
  });

  it('rola até a mensagem citada e destaca a original', () => {
    const messages = [
      { _id: 'original', sender: 'client', body: 'Original' },
      {
        _id: 'reply',
        sender: 'agent',
        body: 'Resposta',
        quotedMessageId: 'original',
        quotedBody: 'Original',
      },
    ];
    const { container } = render(<ChatPanel {...baseProps} messages={messages} onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ir para a mensagem citada' }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(container.querySelector('.quote-highlight-wrapper')).toBeTruthy();
  });
});
