import { Fragment, useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import MessageBubble from './MessageBubble';

export default function ChatPanel({ ticket, messages, unreadMarker, contactOnline, onSend, onFile, onToggle, onClose, onBack, onOpenImage }) {
  const [text, setText] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const bottom = useRef(null);
  const unreadSeparator = useRef(null);
  const positionedMarker = useRef(null);
  useEffect(() => {
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
  if (!ticket) return <section className="chat-panel empty-chat">Selecione uma conversa para visualizar as mensagens.</section>;
  const submit = async event => { event.preventDefault(); if (!text.trim()) return; const value = text.trim(); setText(''); await onSend(value); };
  const genericNames = ['', 'Grupo', 'Grupo sem nome', 'Grupo do WhatsApp'];
  const displayName = ticket.isGroup && genericNames.includes((ticket.contactName || '').trim()) ? 'Grupo do WhatsApp' : (ticket.contactName || ticket.phoneNumber);
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
    <header className="chat-header"><button type="button" className="mobile-back" onClick={onBack} aria-label="Voltar para conversas"><i className="fa-solid fa-arrow-left" /></button><div className="chat-contact"><Avatar ticket={ticket} /><div><span className="chat-title-line"><strong>{displayName}</strong><em className={`badge ${ticket.status}`}>{ticket.status === 'closed' ? 'Encerrado' : ticket.status === 'open' ? 'Em atendimento' : 'Pendente'}</em></span><small>{ticket.isGroup ? 'Grupo do WhatsApp' : contactOnline ? <span className="contact-online"><i />online</span> : ticket.phoneNumber}</small></div></div><div className="chat-actions"><button className={ticket.status === 'open' ? 'warning' : 'primary'} onClick={onToggle}><i className={`fa-solid ${ticket.status === 'open' ? 'fa-arrow-rotate-left' : 'fa-user-check'}`} /><span>{ticket.status === 'open' ? 'Devolver' : 'Assumir'}</span></button><button className="danger" onClick={onClose}><i className="fa-solid fa-check-double" /><span>Encerrar</span></button><button type="button" className="close-view" onClick={onBack} title="Fechar conversa" aria-label="Fechar conversa"><i className="fa-solid fa-xmark" /><span></span></button></div></header>
    <div className="messages" onScroll={handleMessagesScroll}>{messages.map((message, index) => <Fragment key={message.id || message._id}>{index === unreadIndex && <div className="unread-separator" ref={unreadSeparator}><span>Novas mensagens</span></div>}<MessageBubble message={message} isGroup={ticket.isGroup} onImage={onOpenImage} /></Fragment>)}<div ref={bottom} /></div>
    {showScrollButton && <button className="scroll-to-bottom" type="button" onClick={scrollToBottom} title="Ir para o fim da conversa" aria-label="Ir para o fim da conversa"><i className="fa-solid fa-chevron-down" /></button>}
    <form className="composer" onSubmit={submit}><label title="Anexar arquivo"><i className="fa-solid fa-paperclip" /><input type="file" hidden onChange={event => { const file = event.target.files[0]; if (file) onFile(file, text).then(() => setText('')); event.target.value = ''; }} /></label><input value={text} onChange={event => setText(event.target.value)} placeholder="Digite uma mensagem" /><button type="submit"><i className="fa-solid fa-paper-plane" /></button></form>
  </section>;
}
