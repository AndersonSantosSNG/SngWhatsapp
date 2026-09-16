import { useEffect, useRef, useState } from 'react';

export const CLOSING_MESSAGE = 'Mensagem automática: Este atendimento foi encerrado. Caso precise de suporte para outra solicitação, basta abrir um novo chamado em https://atendimento.sng.com.br/ ou enviar uma mensagem por aqui. Agradecemos o seu contato e estamos à disposição!';

export default function CloseChatDialog({ canSendMessages, onSend, onClose, onCancel }) {
  const dialog = useRef(null);
  const busy = useRef(false);
  const [sendMessage, setSendMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  const confirm = async event => {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setClosing(true);
    setError('');
    try {
      if (canSendMessages && sendMessage && !messageSent) {
        await onSend(CLOSING_MESSAGE, undefined, { isClosingMessage: true });
        setMessageSent(true);
      }
      if (await onClose() === false) throw new Error('Não foi possível encerrar o atendimento. Tente novamente.');
      onCancel();
    } catch (err) {
      setError(err.message || 'Não foi possível concluir o encerramento. Tente novamente.');
    } finally {
      busy.current = false;
      setClosing(false);
    }
  };

  return <dialog ref={dialog} className="card close-chat-dialog" aria-labelledby="close-chat-title" onCancel={event => { event.preventDefault(); if (!busy.current) onCancel(); }}>
    <form onSubmit={confirm}>
      <h2 id="close-chat-title">Encerrar atendimento</h2>
      <p>Deseja enviar uma mensagem de encerramento?</p>
      <blockquote>{CLOSING_MESSAGE}</blockquote>
      <label className="close-chat-option"><input type="checkbox" checked={sendMessage} disabled={closing || messageSent || !canSendMessages} onChange={event => setSendMessage(event.target.checked)} />Enviar mensagem de encerramento</label>
      {!canSendMessages && <p>Esta conversa não permite o envio de mensagens.</p>}
      {messageSent && <p role="status">Mensagem enviada. Falta concluir o encerramento.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="close-chat-actions"><button type="button" onClick={onCancel} disabled={closing}>Cancelar</button><button type="submit" className="submit-button" disabled={closing}>{closing ? 'Encerrando...' : 'Confirmar encerramento'}</button></div>
    </form>
  </dialog>;
}
