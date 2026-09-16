import { Fragment, useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import GroupMembersDialog from './GroupMembersDialog';
import CloseChatDialog from './CloseChatDialog';
import OpenGlpiTicketDialog from './OpenGlpiTicketDialog';
import DeleteMessageDialog from './DeleteMessageDialog';
import MessageBubble from './MessageBubble';
import { formatPhone } from '../utils/phone';

function getMessageDate(message) {
  const value = message?.sentAt || message?.timestamp || message?.createdAt;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDateKey(message) {
  const date = getMessageDate(message);
  return date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : '';
}

function formatDateSeparator(message) {
  const date = getMessageDate(message);
  if (!date) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((today - messageDay) / 86400000);
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  if (days > 1 && days < 7) return date.toLocaleDateString('pt-BR', { weekday: 'long' });
  return date.toLocaleDateString('pt-BR');
}

export default function ChatPanel({ chat, messages, unreadMarker, contactOnline, hasOlderMessages, loadingOlderMessages, onLoadOlder, onSend, onEdit, onDelete, onFile, onToggle, onClose, onCreateGlpiTicket, onBack, onOpenImage }) {
  const [text, setText] = useState('');
  const [membersTicketId, setMembersTicketId] = useState(null);
  useEffect(() => setMembersTicketId(null), [chat?._id]);
  const [closingTicketId, setClosingTicketId] = useState(null);
  useEffect(() => setClosingTicketId(null), [chat?._id]);
  const [glpiTicketId, setGlpiTicketId] = useState(null);
  useEffect(() => setGlpiTicketId(null), [chat?._id]);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [deletingMessage, setDeletingMessage] = useState(null);
  const [highlightedMessage, setHighlightedMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  useEffect(() => { setEditingMessage(null); setDeletingMessage(null); setReplyTo(null); setText(''); }, [chat?._id]);
  const bottom = useRef(null);
  const messageElements = useRef(new Map());
  const highlightTimer = useRef(null);
  const messagesContainer = useRef(null);
  const preserveScroll = useRef(false);
  const unreadSeparator = useRef(null);
  const positionedMarker = useRef(null);
  useEffect(() => {
    if (preserveScroll.current) { preserveScroll.current = false; return; }
    if (unreadMarker && unreadSeparator.current) {
      const markerKey = `${chat?._id}-${unreadMarker.firstMessageId}`;
      if (positionedMarker.current !== markerKey) {
        unreadSeparator.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        positionedMarker.current = markerKey;
      }
      return;
    }
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chat?._id, unreadMarker]);
  const handleMessagesScroll = event => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    setShowScrollButton(scrollHeight - scrollTop - clientHeight > 160);
  };
  const scrollToBottom = () => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollButton(false);
  };
  const loadOlder = async () => {
    const container = messagesContainer.current;
    const previousHeight = container?.scrollHeight || 0;
    preserveScroll.current = true;
    await onLoadOlder();
    requestAnimationFrame(() => {
      if (container) container.scrollTop += container.scrollHeight - previousHeight;
    });
  };
  const scrollToQuotedMessage = quotedMessage => {
    let target = messages.find(message =>
      (quotedMessage.quotedMessageId && String(message.id || message._id) === String(quotedMessage.quotedMessageId))
      || (quotedMessage.quotedWhatsappMessageId && message.whatsappMessageId === quotedMessage.quotedWhatsappMessageId)
    );
    if (!target && quotedMessage.quotedBody) {
      const quotedIndex = messages.findIndex(message => String(message.id || message._id) === String(quotedMessage.id || quotedMessage._id));
      const candidates = quotedIndex >= 0 ? messages.slice(0, quotedIndex) : messages;
      const expectedBody = String(quotedMessage.quotedBody).trim();
      target = [...candidates].reverse().find(message => {
        const body = String(message.body || (message.hasMedia ? '[Mídia/Arquivo]' : '')).trim();
        return body === expectedBody;
      });
    }
    if (!target) return;
    const targetId = String(target.id || target._id);
    messageElements.current.get(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    clearTimeout(highlightTimer.current);
    setHighlightedMessage(targetId);
    highlightTimer.current = setTimeout(() => setHighlightedMessage(''), 1500);
  };
  useEffect(() => () => clearTimeout(highlightTimer.current), []);
  if (!chat) return <section className="chat-panel empty-chat">Selecione uma conversa para visualizar as mensagens.</section>;
  const submit = async event => {
    event.preventDefault();
    if (!text.trim() || sending) return;
    const value = text.trim();
    const selectedReply = replyTo;
    const selectedEdit = editingMessage;
    const replyId = selectedReply?.id || selectedReply?._id;
    setSending(true); setSendError(''); setText(''); setReplyTo(null); setEditingMessage(null);
    try {
      if (selectedEdit) await onEdit(selectedEdit.id || selectedEdit._id, value);
      else await onSend(value, replyId);
    }
    catch (err) { setText(value); setReplyTo(selectedReply); setEditingMessage(selectedEdit); setSendError(err.message || 'Não foi possível concluir. Tente novamente.'); }
    finally { setSending(false); }
  };
  const startEditing = message => {
    setEditingMessage(message);
    setReplyTo(null);
    setText(message.body || '');
    setSendError('');
  };
  const deleteForEveryone = async message => {
    await onDelete(message.id || message._id);
    if (String(editingMessage?.id || editingMessage?._id) === String(message.id || message._id)) {
      setEditingMessage(null);
      setText('');
    }
  };
  const genericNames = ['', 'Grupo', 'Grupo sem nome', 'Grupo do WhatsApp'];
  const rawDisplayName = chat.contactName || chat.phoneNumber;
  const displayName = chat.isGroup && genericNames.includes((chat.contactName || '').trim())
    ? 'Grupo do WhatsApp'
    : /^\+?\d+$/.test(String(rawDisplayName)) ? formatPhone(rawDisplayName) : rawDisplayName;
  const whatsappId = String(chat.whatsappId || '');
  const canSendMessages = !whatsappId.endsWith('@newsletter')
    && !whatsappId.endsWith('@broadcast')
    && whatsappId !== 'status@broadcast';
  let unreadIndex = unreadMarker?.firstMessageId
    ? messages.findIndex(message => String(message.id || message._id) === String(unreadMarker.firstMessageId))
    : -1;
  if (unreadIndex < 0 && unreadMarker?.count) {
    let remaining = unreadMarker.count;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (!(message.fromMe ?? message.sender === 'agent')) remaining -= 1;
      if (remaining === 0) { unreadIndex = index; break; }
    }
  }
  return <section className="chat-panel">
    {chat.isGroup && membersTicketId === chat._id && <GroupMembersDialog key={chat._id} chat={chat} onClose={() => setMembersTicketId(null)} />}
    {closingTicketId === chat._id && <CloseChatDialog key={chat._id} canSendMessages={canSendMessages} onSend={onSend} onClose={onClose} onCancel={() => setClosingTicketId(null)} />}
    {glpiTicketId === chat._id && <OpenGlpiTicketDialog key={chat._id} chat={chat} onCreate={onCreateGlpiTicket} onCancel={() => setGlpiTicketId(null)} />}
    {deletingMessage && <DeleteMessageDialog message={deletingMessage} onConfirm={deleteForEveryone} onCancel={() => setDeletingMessage(null)} />}
    <header className="chat-header"><button type="button" className="mobile-back" onClick={onBack} aria-label="Voltar para conversas"><i className="fa-solid fa-arrow-left" /></button><div className="chat-contact">{chat.isGroup ? <button type="button" className="group-profile-button" onClick={() => setMembersTicketId(chat._id)} title="Ver membros do grupo" aria-label="Ver membros do grupo"><Avatar chat={chat} /></button> : <Avatar chat={chat} />}<div><span className="chat-title-line"><strong>{displayName}</strong><em className={`badge ${chat.status}`}>{chat.status === 'closed' ? 'Encerrado' : chat.status === 'open' ? 'Em atendimento' : 'Pendente'}</em></span><small>{chat.isGroup ? 'Grupo do WhatsApp' : contactOnline ? <span className="contact-online"><i />online</span> : formatPhone(chat.phoneNumber)}</small></div></div><div className="chat-actions"><button type="button" className="secondary" onClick={() => setGlpiTicketId(chat._id)}><i className="fa-solid fa-ticket" /><span>Abrir chamado</span></button><button className={chat.status === 'open' ? 'warning' : 'primary'} onClick={onToggle}><i className={`fa-solid ${chat.status === 'open' ? 'fa-arrow-rotate-left' : 'fa-user-check'}`} /><span>{chat.status === 'open' ? 'Devolver' : 'Assumir'}</span></button><button className="danger" onClick={() => setClosingTicketId(chat._id)}><i className="fa-solid fa-check-double" /><span>Encerrar</span></button><button type="button" className="close-view" onClick={onBack} title="Fechar conversa" aria-label="Fechar conversa"><i className="fa-solid fa-xmark" /></button></div></header>
    <div className="messages" ref={messagesContainer} onScroll={handleMessagesScroll}>{hasOlderMessages && <button type="button" className="load-older-messages" onClick={loadOlder} disabled={loadingOlderMessages}><i className={`fa-solid ${loadingOlderMessages ? 'fa-spinner fa-spin' : 'fa-clock-rotate-left'}`} />{loadingOlderMessages ? 'Carregando...' : 'Carregar mensagens anteriores'}</button>}{messages.map((message, index) => { const messageId = String(message.id || message._id); const dateKey = getDateKey(message); const showDateSeparator = dateKey && dateKey !== getDateKey(messages[index - 1]); return <Fragment key={messageId}>{showDateSeparator && <div className="date-separator"><span>{formatDateSeparator(message)}</span></div>}{index === unreadIndex && <div className="unread-separator" ref={unreadSeparator}><span>Novas mensagens</span></div>}<div ref={element => { if (element) messageElements.current.set(messageId, element); else messageElements.current.delete(messageId); }} className={highlightedMessage === messageId ? 'quote-highlight-wrapper' : ''}><MessageBubble message={message} isGroup={chat.isGroup} onImage={onOpenImage} onReply={canSendMessages ? setReplyTo : undefined} onEdit={canSendMessages ? startEditing : undefined} onDelete={canSendMessages ? setDeletingMessage : undefined} onQuotedClick={scrollToQuotedMessage} /></div></Fragment>; })}<div ref={bottom} /></div>
    {showScrollButton && <button className="scroll-to-bottom" type="button" onClick={scrollToBottom} title="Ir para o fim da conversa" aria-label="Ir para o fim da conversa"><i className="fa-solid fa-chevron-down" /></button>}
    {canSendMessages ? <form className={`composer ${replyTo || editingMessage ? 'with-reply' : ''}`} onSubmit={submit}>{editingMessage && <div className="reply-preview edit-preview"><div><strong>Editando mensagem</strong><span>{editingMessage.body}</span></div><button type="button" onClick={() => { setEditingMessage(null); setText(''); }} title="Cancelar edição" aria-label="Cancelar edição"><i className="fa-solid fa-xmark" /></button></div>}{replyTo && <div className="reply-preview"><div><strong>{(replyTo.fromMe ?? replyTo.sender === 'agent') ? 'Você' : (replyTo.groupSenderName || replyTo.senderName || displayName)}</strong><span>{replyTo.body || (replyTo.hasMedia ? 'Mídia/Arquivo' : 'Mensagem')}</span></div><button type="button" onClick={() => setReplyTo(null)} title="Cancelar resposta" aria-label="Cancelar resposta"><i className="fa-solid fa-xmark" /></button></div>}{sendError && <div className="composer-feedback error" role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /><span>{sendError}</span><button type="button" onClick={() => setSendError('')} aria-label="Fechar aviso de envio" title="Fechar aviso"><i className="fa-solid fa-xmark" aria-hidden="true" /></button></div>}{!editingMessage && <label title="Anexar arquivo"><i className="fa-solid fa-paperclip" /><input type="file" hidden disabled={sending} onChange={event => { const file = event.target.files[0]; const replyId = replyTo?.id || replyTo?._id; if (file) onFile(file, text, replyId).then(() => { setText(''); setReplyTo(null); setSendError(''); }).catch(err => setSendError(err.message || 'Não foi possível enviar o arquivo.')); event.target.value = ''; }} /></label>}<input value={text} disabled={sending} onChange={event => setText(event.target.value)} placeholder={sending ? (editingMessage ? 'Salvando edição...' : 'Enviando...') : editingMessage ? 'Editar mensagem' : replyTo ? 'Responder mensagem' : 'Digite uma mensagem'} /><button type="submit" disabled={sending || !text.trim()} aria-label={editingMessage ? 'Salvar edição' : 'Enviar mensagem'}><i className={`fa-solid ${sending ? 'fa-spinner fa-spin' : editingMessage ? 'fa-check' : 'fa-paper-plane'}`} /></button></form> : <div className="read-only-conversation"><i className="fa-solid fa-lock" /><span>Esta conversa não permite o envio de mensagens.</span></div>}
  </section>;
}
