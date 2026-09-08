import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OpenGlpiTicketDialog from './OpenGlpiTicketDialog';

describe('OpenGlpiTicketDialog', () => {
  it('envia o título e informa quantas mensagens recentes serão incluídas', async () => {
    const onCreate = vi.fn().mockResolvedValue({ id: 123 });
    const onCancel = vi.fn();
    const messageId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: [{ _id: messageId, sender: 'client', body: 'Recente', hasMedia: true, attachmentAvailable: true, mediaFileName: 'erro.png', timestamp: new Date().toISOString() }] })
    });
    render(<OpenGlpiTicketDialog
      ticket={{ _id: 'ticket-1', contactName: 'Cliente' }}
      onCreate={onCreate}
      onCancel={onCancel}
    />);

    expect(await screen.findByText((_, element) => element.classList.contains('glpi-history-summary') && element.textContent.includes('1 mensagem selecionada'))).toBeVisible();
    expect(screen.getByText('erro.png')).toBeVisible();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(screen.getByText((_, element) => element.classList.contains('glpi-history-summary') && element.textContent.includes('0 arquivos selecionados'))).toBeVisible();
    fireEvent.click(checkbox);
    expect(screen.getByText((_, element) => element.classList.contains('glpi-history-summary') && element.textContent.includes('1 arquivo selecionado'))).toBeVisible();
    fireEvent.change(screen.getByLabelText('Título do chamado'), { target: { value: 'Erro no sistema' } });
    fireEvent.submit(screen.getByLabelText('Título do chamado').closest('form'));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Erro no sistema', [messageId], [messageId]));
    expect(onCancel).toHaveBeenCalled();
  });
});
