import { useEffect, useRef, useState } from 'react';

export default function DeleteMessageDialog({ message, onConfirm, onCancel }) {
  const dialog = useRef(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  const confirm = async event => {
    event.preventDefault();
    if (deleting) return;
    setDeleting(true);
    setError('');
    try {
      await onConfirm(message);
      onCancel();
    } catch (err) {
      setError(err.message || 'Não foi possível apagar a mensagem para todos.');
      setDeleting(false);
    }
  };

  return <dialog ref={dialog} className="card delete-message-dialog" aria-labelledby="delete-message-title" onCancel={event => { event.preventDefault(); if (!deleting) onCancel(); }}>
    <form onSubmit={confirm}>
      <div className="delete-message-title"><i className="fa-solid fa-trash-can" /><div><h2 id="delete-message-title">Apagar para todos?</h2><p>A mensagem será removida do WhatsApp dos participantes.</p></div></div>
      <blockquote>{message.body || (message.hasMedia ? 'Mídia/Arquivo' : 'Mensagem')}</blockquote>
      <div className="delete-message-notice"><i className="fa-solid fa-box-archive" /><span>Uma cópia continuará registrada neste painel e receberá a marcação “apagada”.</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="delete-message-actions"><button type="button" onClick={onCancel} disabled={deleting}>Cancelar</button><button type="submit" className="danger" disabled={deleting}>{deleting ? <><i className="fa-solid fa-spinner fa-spin" />Apagando...</> : <><i className="fa-solid fa-trash-can" />Apagar para todos</>}</button></div>
    </form>
  </dialog>;
}
