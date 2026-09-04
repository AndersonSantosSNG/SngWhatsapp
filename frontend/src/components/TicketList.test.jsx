import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TicketList from './TicketList';

const tickets = [
  { _id: '1', phoneNumber: '5511999999999', contactName: 'Ana', status: 'pending', lastMessage: 'Olá' },
  { _id: '2', phoneNumber: '5511888888888', contactName: 'Bruno', status: 'open', assignedAgent: 'agent-1', lastMessage: 'Teste' },
  { _id: '3', phoneNumber: '120363@g.us', whatsappId: '120363@g.us', contactName: 'Equipe', status: 'closed', isGroup: true }
];

const props = { tickets, loading: false, activeId: '', agentId: 'agent-1', unreadByTicket: { 1: { count: 2 } }, onSelect: vi.fn(), reload: vi.fn(), onNewConversation: vi.fn(), theme: 'dark', setTheme: vi.fn() };

describe('TicketList', () => {
  it('pesquisa e filtra atendimentos', () => {
    render(<TicketList {...props} />);
    fireEvent.change(screen.getByLabelText('Pesquisar conversas'), { target: { value: 'Ana' } });
    expect(screen.getByText('Ana')).toBeVisible();
    expect(screen.queryByText('Bruno')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Pesquisar conversas'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Meus atendimentos' }));
    expect(screen.getByText('Bruno')).toBeVisible();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
  });

  it('adiciona 55 ao número nacional mascarado', async () => {
    const onNewConversation = vi.fn().mockResolvedValue(undefined);
    render(<TicketList {...props} onNewConversation={onNewConversation} />);
    fireEvent.click(screen.getByLabelText('Nova conversa'));
    const input = screen.getByLabelText('DDD + telefone');
    fireEvent.change(input, { target: { value: '11999999999' } });
    expect(input).toHaveValue('(11) 99999-9999');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir conversa' }));
    await waitFor(() => expect(onNewConversation).toHaveBeenCalledWith('5511999999999'));
  });

  it('usa código informado para número internacional', async () => {
    const onNewConversation = vi.fn().mockResolvedValue(undefined);
    render(<TicketList {...props} onNewConversation={onNewConversation} />);
    fireEvent.click(screen.getByLabelText('Nova conversa'));
    fireEvent.click(screen.getByLabelText('É número internacional?'));
    fireEvent.change(screen.getByLabelText('Código do país'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('DDD + telefone'), { target: { value: '1199999999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir conversa' }));
    await waitFor(() => expect(onNewConversation).toHaveBeenCalledWith('11199999999'));
  });
});
