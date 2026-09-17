import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import CloseChatDialog, { CLOSING_MESSAGE } from './CloseChatDialog';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

function setup(overrides = {}) {
  const props = {
    canSendMessages: true,
    onSend: vi.fn().mockResolvedValue({}),
    onClose: vi.fn().mockResolvedValue(true),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<CloseChatDialog {...props} />);
  return props;
}
const confirm = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento' }));
const selectMessage = () => fireEvent.click(screen.getByRole('checkbox'));

describe('CloseChatDialog', () => {
  it('permite cancelar sem enviar ou encerrar', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(props.onCancel).toHaveBeenCalledOnce();
    expect(props.onSend).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('encerra sem mensagem quando a opção não está marcada', async () => {
    const props = setup();
    confirm();
    await waitFor(() => expect(props.onCancel).toHaveBeenCalledOnce());
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it('aguarda o envio antes de encerrar e bloqueia confirmação duplicada', async () => {
    let finishSend;
    const props = setup({
      onSend: vi.fn(
        () =>
          new Promise((resolve) => {
            finishSend = resolve;
          }),
      ),
    });
    selectMessage();
    confirm();
    expect(props.onSend).toHaveBeenCalledWith(CLOSING_MESSAGE, undefined, {
      isClosingMessage: true,
    });
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Encerrando...' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'Encerrando...' }).closest('form'));
    expect(props.onSend).toHaveBeenCalledOnce();
    finishSend();
    await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
  });

  it('mantém atendimento aberto quando o envio falha', async () => {
    const props = setup({ onSend: vi.fn().mockRejectedValue(new Error('Falha no envio')) });
    selectMessage();
    confirm();
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha no envio');
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('não repete mensagem enviada ao tentar novamente um encerramento que falhou', async () => {
    const props = setup({
      onClose: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    });
    selectMessage();
    confirm();
    await screen.findByRole('alert');
    confirm();
    await waitFor(() => expect(props.onCancel).toHaveBeenCalledOnce());
    expect(props.onClose).toHaveBeenCalledTimes(2);
    expect(props.onSend).toHaveBeenCalledOnce();
  });

  it('permite encerrar conversas somente leitura sem envio', async () => {
    const props = setup({ canSendMessages: false });
    expect(screen.getByRole('checkbox')).toBeDisabled();
    confirm();
    await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
    expect(props.onSend).not.toHaveBeenCalled();
  });
});
