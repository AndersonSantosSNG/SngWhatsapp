import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MessageBubble from './MessageBubble';

describe('MessageBubble', () => {
  it('copia o texto pelo menu da mensagem', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(
      <MessageBubble message={{ _id: 'copy', sender: 'client', body: 'Texto para copiar' }} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Mais op/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copiar' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Texto para copiar'));
  });

  it('diferencia mensagem lida e permite responder', () => {
    const onReply = vi.fn();
    render(
      <MessageBubble
        message={{ _id: '1', sender: 'agent', body: 'Olá', ack: 3 }}
        onReply={onReply}
      />,
    );
    expect(screen.getByLabelText('Lida')).toHaveClass('read');
    fireEvent.click(screen.getByRole('button', { name: 'Responder mensagem' }));
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ _id: '1' }));
  });

  it('exibe e aciona uma citação', () => {
    const onQuotedClick = vi.fn();
    const message = {
      _id: '2',
      sender: 'client',
      body: 'Resposta',
      quotedBody: 'Original',
      quotedSenderName: 'Cliente',
    };
    render(<MessageBubble message={message} onQuotedClick={onQuotedClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ir para a mensagem citada' }));
    expect(onQuotedClick).toHaveBeenCalledWith(message);
  });
  it('exibe o número do chamado GLPI como link no evento interno', () => {
    render(
      <MessageBubble
        message={{
          sender: 'agent',
          isInternalEvent: true,
          internalAction: 'glpi_created',
          internalActorName: 'Anderson Santos',
          glpiTicketId: '1234',
          glpiTicketUrl: 'https://atendimento.sng.com.br/front/ticket.form.php?id=1234',
          timestamp: '2026-09-08T14:25:00.000Z',
        }}
      />,
    );
    const link = screen.getByRole('link', { name: '1234' });
    expect(link).toHaveAttribute(
      'href',
      'https://atendimento.sng.com.br/front/ticket.form.php?id=1234',
    );
    expect(screen.getByText(/Anderson Santos abriu um chamado/)).toBeVisible();
  });
  it('exibe chamada recebida como evento no chat', () => {
    render(
      <MessageBubble
        message={{
          sender: 'client',
          isInternalEvent: true,
          internalAction: 'call_received',
          body: 'Chamada de voz recebida — não atendida neste atendimento',
          timestamp: '2026-09-16T13:25:00.000Z',
        }}
      />,
    );
    expect(screen.getByText(/Chamada de voz recebida/)).toBeVisible();
    expect(document.querySelector('.fa-arrow-down')).toBeInTheDocument();
    expect(screen.getByText('Contato')).toBeVisible();
  });
  it('exibe chamada negada como evento no chat', () => {
    render(
      <MessageBubble
        message={{
          sender: 'client',
          isInternalEvent: true,
          internalAction: 'call_rejected',
          body: 'Chamada de vídeo negada',
          timestamp: '2026-09-16T13:30:00.000Z',
        }}
      />,
    );
    expect(screen.getByText(/Chamada de vídeo negada/)).toBeVisible();
    expect(document.querySelector('.fa-phone-slash')).toBeInTheDocument();
  });
  it('identifica uma chamada feita pelo atendimento', () => {
    render(
      <MessageBubble
        message={{
          sender: 'agent',
          fromMe: true,
          isInternalEvent: true,
          internalAction: 'call_made',
          body: 'Chamada de voz realizada',
          timestamp: '2026-09-16T13:35:00.000Z',
        }}
      />,
    );
    expect(screen.getByText('Você')).toBeVisible();
    expect(document.querySelector('.fa-arrow-up')).toBeInTheDocument();
  });
});
