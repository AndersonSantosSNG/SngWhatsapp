import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

function MediaPreview({ message }) {
  if (!message.hasMedia) return null;
  if (!message.attachmentAvailable) return <span className="glpi-media-unavailable"><i className="fa-solid fa-triangle-exclamation" /> Arquivo não disponível no servidor</span>;
  const url = `/api/messages/${encodeURIComponent(message._id)}/media`;
  const mime = message.mediaMimeType || '';
  if (mime.startsWith('image/')) return <a className="glpi-media-preview image" href={url} target="_blank" rel="noreferrer"><img src={url} alt={message.mediaFileName || 'Imagem anexada'} /><span><i className="fa-solid fa-paperclip" />{message.mediaFileName || 'Imagem'}</span></a>;
  if (mime.startsWith('audio/')) return <div className="glpi-media-preview"><span><i className="fa-solid fa-microphone" />{message.mediaFileName || 'Áudio'}</span><audio src={url} controls preload="metadata" /></div>;
  if (mime.startsWith('video/')) return <div className="glpi-media-preview"><span><i className="fa-solid fa-video" />{message.mediaFileName || 'Vídeo'}</span><video src={url} controls preload="metadata" /></div>;
  return <a className="glpi-media-preview file" href={url} target="_blank" rel="noreferrer"><i className="fa-solid fa-file-arrow-down" /><span>{message.mediaFileName || 'Abrir arquivo'}</span></a>;
}

export default function OpenGlpiTicketDialog({ chat, onCreate, onCancel }) {
  const dialog = useRef(null);
  const [title, setTitle] = useState('');
  const [messages, setMessages] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [attachmentIds, setAttachmentIds] = useState(new Set());
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    let active = true;
    api(`/tickets/${chat._id}/glpi/messages`)
      .then(result => {
        if (!active) return;
        setMessages(result.data);
        setSelectedIds(new Set(result.data.map(message => String(message._id))));
        setAttachmentIds(new Set(result.data.filter(message => message.attachmentAvailable).map(message => String(message._id))));
      })
      .catch(err => { if (active) setError(err.message || 'Não foi possível carregar as mensagens.'); })
      .finally(() => { if (active) setLoadingMessages(false); });
    return () => { active = false; };
  }, [chat._id]);

  const toggleMessage = messageId => setSelectedIds(current => {
    const next = new Set(current);
    if (next.has(messageId)) {
      next.delete(messageId);
      setAttachmentIds(attachments => { const updated = new Set(attachments); updated.delete(messageId); return updated; });
    } else {
      next.add(messageId);
      if (messages.some(message => String(message._id) === messageId && message.attachmentAvailable)) {
        setAttachmentIds(attachments => new Set([...attachments, messageId]));
      }
    }
    return next;
  });
  const toggleAll = () => {
    if (selectedIds.size === messages.length) {
      setSelectedIds(new Set());
      setAttachmentIds(new Set());
    } else {
      setSelectedIds(new Set(messages.map(message => String(message._id))));
      setAttachmentIds(new Set(messages.filter(message => message.attachmentAvailable).map(message => String(message._id))));
    }
  };

  const submit = async event => {
    event.preventDefault();
    if (!title.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      await onCreate(title.trim(), [...selectedIds], [...attachmentIds]);
      onCancel();
    } catch (err) {
      setError(err.message || 'Não foi possível abrir o chamado.');
    } finally {
      setCreating(false);
    }
  };

  return <dialog ref={dialog} className="card glpi-ticket-dialog" aria-labelledby="glpi-ticket-title" onCancel={event => { event.preventDefault(); if (!creating) onCancel(); }}>
    <form onSubmit={submit}>
      <h2 id="glpi-ticket-title">Abrir chamado</h2>
      <p>O histórico desta conversa nas últimas 48 horas será incluído no chamado do GLPI.</p>
      <label>Título do chamado<input autoFocus maxLength={255} value={title} disabled={creating} onChange={event => setTitle(event.target.value)} placeholder={`Atendimento - ${chat.contactName || chat.phoneNumber}`} /></label>
      <div className="glpi-message-heading"><strong>Mensagens que serão enviadas</strong>{messages.length > 0 && <button type="button" className={selectedIds.size === messages.length ? 'clear-selection' : 'select-all'} onClick={toggleAll} disabled={creating}><i className={`fa-solid ${selectedIds.size === messages.length ? 'fa-square-minus' : 'fa-square-check'}`} />{selectedIds.size === messages.length ? 'Desmarcar todas' : 'Selecionar todas'}</button>}</div>
      <div className="glpi-message-list" aria-label="Mensagens das últimas 48 horas">
        {loadingMessages && <p>Carregando mensagens...</p>}
        {!loadingMessages && !messages.length && <p>Nenhuma mensagem encontrada nas últimas 48 horas.</p>}
        {messages.map(message => {
          const id = String(message._id);
          const author = message.sender === 'agent' ? 'Agente' : (message.groupSenderName || 'Usuário');
          const time = new Date(message.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
          const text = String(message.body || '').trim();
          const hasCaption = text && text !== '[Mídia/Arquivo]';
          return <div key={id} className={`glpi-message-option ${selectedIds.has(id) ? 'selected' : ''}`}><input type="checkbox" aria-label={`Incluir mensagem de ${author}`} checked={selectedIds.has(id)} disabled={creating} onChange={() => toggleMessage(id)} /><span><strong>{author}</strong><small>{time}</small>{hasCaption && <span>{text}</span>}<MediaPreview message={message} /></span></div>;
        })}
      </div>
      <p className="glpi-history-summary"><i className="fa-solid fa-comments" /> {selectedIds.size} {selectedIds.size === 1 ? 'mensagem selecionada' : 'mensagens selecionadas'} · <i className="fa-solid fa-paperclip" /> {attachmentIds.size} {attachmentIds.size === 1 ? 'arquivo selecionado' : 'arquivos selecionados'}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="close-chat-actions"><button type="button" className="secondary-action" onClick={onCancel} disabled={creating}>Cancelar</button><button type="submit" className="submit-button" disabled={creating || loadingMessages || !title.trim() || !selectedIds.size}>{creating ? 'Abrindo...' : 'Abrir chamado'}</button></div>
    </form>
  </dialog>;
}
