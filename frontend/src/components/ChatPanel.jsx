import { Fragment, useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import MessageBubble from './MessageBubble';
import { formatPhone } from '../utils/phone';

export default function ChatPanel({ ticket, messages, unreadMarker, contactOnline, hasOlderMessages, loadingOlderMessages, onLoadOlder, onSend, onFile, onToggle, onClose, onBack, onOpenImage }) {
  const [text, setText] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [highlightedMessage, setHighlightedMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
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
      const markerKey = `${ticket?._id}-${unreadMarker.firstMessageId}`;
      if (positionedMarker.current !== markerKey) {
        unreadSeparator.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        positionedMarker.current = markerKey;
      }
      return;
    }
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, ticket?._id, unreadMarker]);
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
  if (!ticket) return <section className="chat-panel empty-chat">Selecione uma conversa para visualizar as mensagens.</section>;
  const submit = async event => {
    event.preventDefault();
    if (!text.trim() || sending) return;
    const value = text.trim();
    const selectedReply = replyTo;
    const replyId = selectedReply?.id || selectedReply?._id;
    setSending(true); setSendError(''); setText(''); setReplyTo(null);
    try { await onSend(value, replyId); }
    catch (err) { setText(value); setReplyTo(selectedReply); setSendError(err.message || 'Não foi possível enviar. Tente novamente.'); }
    finally { setSending(false); }
  };
  const genericNames = ['', 'Grupo', 'Grupo sem nome', 'Grupo do WhatsApp'];
  const rawDisplayName = ticket.contactName || ticket.phoneNumber;
  const displayName = ticket.isGroup && genericNames.includes((ticket.contactName || '').trim())
    ? 'Grupo do WhatsApp'
    : /^\+?\d+$/.test(String(rawDisplayName)) ? formatPhone(rawDisplayName) : rawDisplayName;
  const whatsappId = String(ticket.whatsappId || '');
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
    <header className="chat-header"><button type="button" className="mobile-back" onClick={onBack} aria-label="Voltar para conversas"><i className="fa-solid fa-arrow-left" /></button><div className="chat-contact"><Avatar ticket={ticket} /><div><span className="chat-title-line"><strong>{displayName}</strong><em className={`badge ${ticket.status}`}>{ticket.status === 'closed' ? 'Encerrado' : ticket.status === 'open' ? 'Em atendimento' : 'Pendente'}</em></span><small>{ticket.isGroup ? 'Grupo do WhatsApp' : contactOnline ? <span className="contact-online"><i />online</span> : formatPhone(ticket.phoneNumber)}</small></div></div><div className="chat-actions"><button className={ticket.status === 'open' ? 'warning' : 'primary'} onClick={onToggle}><i className={`fa-solid ${ticket.status === 'open' ? 'fa-arrow-rotate-left' : 'fa-user-check'}`} /><span>{ticket.status === 'open' ? 'Devolver' : 'Assumir'}</span></button><button className="danger" onClick={onClose}><i className="fa-solid fa-check-double" /><span>Encerrar</span></button><button type="button" className="close-view" onClick={onBack} title="Fechar conversa" aria-label="Fechar conversa"><i className="fa-solid fa-xmark" /></button></div></header>
    <div className="messages" ref={messagesContainer} onScroll={handleMessagesScroll}>{hasOlderMessages && <button type="button" className="load-older-messages" onClick={loadOlder} disabled={loadingOlderMessages}><i className={`fa-solid ${loadingOlderMessages ? 'fa-spinner fa-spin' : 'fa-clock-rotate-left'}`} />{loadingOlderMessages ? 'Carregando...' : 'Carregar mensagens anteriores'}</button>}{messages.map((message, index) => { const messageId = String(message.id || message._id); return <Fragment key={messageId}>{index === unreadIndex && <div className="unread-separator" ref={unreadSeparator}><span>Novas mensagens</span></div>}<div ref={element => { if (element) messageElements.current.set(messageId, element); else messageElements.current.delete(messageId); }} className={highlightedMessage === messageId ? 'quote-highlight-wrapper' : ''}><MessageBubble message={message} isGroup={ticket.isGroup} onImage={onOpenImage} onReply={canSendMessages ? setReplyTo : undefined} onQuotedClick={scrollToQuotedMessage} /></div></Fragment>; })}<div ref={bottom} /></div>
    {showScrollButton && <button className="scroll-to-bottom" type="button" onClick={scrollToBottom} title="Ir para o fim da conversa" aria-label="Ir para o fim da conversa"><i className="fa-solid fa-chevron-down" /></button>}
    {canSendMessages ? <form className={`composer ${replyTo ? 'with-reply' : ''}`} onSubmit={submit}>{replyTo && <div className="reply-preview"><div><strong>{(replyTo.fromMe ?? replyTo.sender === 'agent') ? 'Você' : (replyTo.groupSenderName || replyTo.senderName || displayName)}</strong><span>{replyTo.body || (replyTo.hasMedia ? 'Mídia/Arquivo' : 'Mensagem')}</span></div><button type="button" onClick={() => setReplyTo(null)} title="Cancelar resposta" aria-label="Cancelar resposta"><i className="fa-solid fa-xmark" /></button></div>}{sendError && <div className="composer-feedback error" role="alert"><i className="fa-solid fa-circle-exclamation" />{sendError}</div>}<label title="Anexar arquivo"><i className="fa-solid fa-paperclip" /><input type="file" hidden disabled={sending} onChange={event => { const file = event.target.files[0]; const replyId = replyTo?.id || replyTo?._id; if (file) onFile(file, text, replyId).then(() => { setText(''); setReplyTo(null); setSendError(''); }).catch(err => setSendError(err.message || 'Não foi possível enviar o arquivo.')); event.target.value = ''; }} /></label><input value={text} disabled={sending} onChange={event => setText(event.target.value)} placeholder={sending ? 'Enviando...' : replyTo ? 'Responder mensagem' : 'Digite uma mensagem'} /><button type="submit" disabled={sending}><i className={`fa-solid ${sending ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} /></button></form> : <div className="read-only-conversation"><i className="fa-solid fa-lock" /><span>Esta conversa não permite o envio de mensagens.</span></div>}
  </section>;
}
