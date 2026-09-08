import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MessageBubble from './MessageBubble';

describe('MessageBubble', () => {
  it('diferencia mensagem lida e permite responder', () => {
    const onReply = vi.fn();
    render(<MessageBubble message={{ _id: '1', sender: 'agent', body: 'Olá', ack: 3 }} onReply={onReply} />);
    expect(screen.getByLabelText('Lida')).toHaveClass('read');
    fireEvent.click(screen.getByRole('button', { name: 'Responder mensagem' }));
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ _id: '1' }));
  });

  it('exibe e aciona uma citação', () => {
    const onQuotedClick = vi.fn();
    const message = { _id: '2', sender: 'client', body: 'Resposta', quotedBody: 'Original', quotedSenderName: 'Cliente' };
    render(<MessageBubble message={message} onQuotedClick={onQuotedClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ir para a mensagem citada' }));
    expect(onQuotedClick).toHaveBeenCalledWith(message);
  });
  it('exibe o número do chamado GLPI como link no evento interno', () => {
    render(<MessageBubble message={{
      sender: 'agent',
      isInternalEvent: true,
      internalAction: 'glpi_created',
      internalActorName: 'Anderson Santos',
      glpiTicketId: '1234',
      glpiTicketUrl: 'https://atendimento.sng.com.br/front/ticket.form.php?id=1234',
      timestamp: '2026-09-08T14:25:00.000Z'
    }} />);
    const link = screen.getByRole('link', { name: '1234' });
    expect(link).toHaveAttribute('href', 'https://atendimento.sng.com.br/front/ticket.form.php?id=1234');
    expect(screen.getByText(/Anderson Santos abriu um chamado/)).toBeVisible();
  });
});
