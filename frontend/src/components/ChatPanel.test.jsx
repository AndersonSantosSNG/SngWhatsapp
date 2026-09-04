import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatPanel from './ChatPanel';

const ticket = { _id: 't1', phoneNumber: '5511999999999', whatsappId: '5511999999999@c.us', contactName: 'Cliente', status: 'pending' };
const baseProps = { ticket, unreadMarker: null, contactOnline: false, hasOlderMessages: false, onLoadOlder: vi.fn(), onFile: vi.fn(), onToggle: vi.fn(), onClose: vi.fn(), onBack: vi.fn(), onOpenImage: vi.fn() };

describe('ChatPanel', () => {
  it('envia texto e bloqueia o campo durante a requisição', async () => {
    let resolveSend;
    const onSend = vi.fn(() => new Promise(resolve => { resolveSend = resolve; }));
    render(<ChatPanel {...baseProps} messages={[]} onSend={onSend} />);
    const input = screen.getByPlaceholderText('Digite uma mensagem');
    fireEvent.change(input, { target: { value: 'Teste' } });
    fireEvent.submit(input.closest('form'));
    expect(screen.getByPlaceholderText('Enviando...')).toBeDisabled();
    resolveSend();
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Teste', undefined));
  });

  it('restaura a mensagem quando o envio falha', async () => {
    render(<ChatPanel {...baseProps} messages={[]} onSend={vi.fn().mockRejectedValue(new Error('Sem conexão'))} />);
    fireEvent.change(screen.getByPlaceholderText('Digite uma mensagem'), { target: { value: 'Não perder' } });
    fireEvent.submit(screen.getByPlaceholderText('Digite uma mensagem').closest('form'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão');
    expect(screen.getByDisplayValue('Não perder')).toBeVisible();
  });

  it('oculta comandos de envio em canal somente leitura', () => {
    render(<ChatPanel {...baseProps} ticket={{ ...ticket, whatsappId: '123@newsletter' }} messages={[]} onSend={vi.fn()} />);
    expect(screen.getByText('Esta conversa não permite o envio de mensagens.')).toBeVisible();
    expect(screen.queryByPlaceholderText('Digite uma mensagem')).not.toBeInTheDocument();
  });

  it('rola até a mensagem citada e destaca a original', () => {
    const messages = [
      { _id: 'original', sender: 'client', body: 'Original' },
      { _id: 'reply', sender: 'agent', body: 'Resposta', quotedMessageId: 'original', quotedBody: 'Original' }
    ];
    const { container } = render(<ChatPanel {...baseProps} messages={messages} onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ir para a mensagem citada' }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(container.querySelector('.quote-highlight-wrapper')).toBeTruthy();
  });
});
