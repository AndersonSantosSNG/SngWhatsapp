import { useEffect, useRef, useState } from 'react';

function Media({ message, onImage }) {
  if (!message.mediaUrl) return null;
  const mime = message.mediaMimeType || '';
  if (mime.startsWith('image/')) return <img className="message-image" src={message.mediaUrl} alt="Mídia" onClick={() => onImage(message.mediaUrl)} />;
  if (mime.startsWith('video/')) return <video className="message-video" src={message.mediaUrl} controls />;
  if (mime.startsWith('audio/')) return <div className="message-audio"><div className="message-audio-heading"><span className="message-audio-icon"><i className="fa-solid fa-microphone" aria-hidden="true" /></span><span>Mensagem de voz</span></div><audio src={message.mediaUrl} controls preload="metadata" aria-label="Reproduzir áudio da mensagem" /></div>;
  return <a className="file-link" href={message.mediaUrl} target="_blank" rel="noreferrer"><i className="fa-solid fa-file-arrow-down" /> {message.mediaFileName || 'Baixar arquivo'}</a>;
}

function LinkifiedText({ text }) {
  const urlPattern = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
  return String(text).split(urlPattern).map((part, index) => {
    if (!/^(?:https?:\/\/|www\.)/i.test(part)) return part;
    const match = part.match(/^(.*?)([.,!?;:)]+)?$/);
    const url = match?.[1] || part;
    const punctuation = match?.[2] || '';
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return <span key={`${url}-${index}`}><a className="message-link" href={href} target="_blank" rel="noopener noreferrer">{url}</a>{punctuation}</span>;
  });
}

export default function MessageBubble({ message, isGroup, onImage, onReply, onEdit, onDelete, onQuotedClick }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuBelow, setMenuBelow] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [, setDeadlineTick] = useState(0);
  const menuRef = useRef(null);
  const longPressTimer = useRef(null);
  const longPressStart = useRef(null);
  const swipeStart = useRef(null);
  useEffect(() => {
    const sentAt = new Date(message.sentAt || message.timestamp || message.createdAt || 0).getTime();
    if (!Number.isFinite(sentAt)) return undefined;
    const remaining = [15 * 60 * 1000, 60 * 60 * 60 * 1000]
      .map(windowMs => sentAt + windowMs - Date.now())
      .filter(value => value > 0);
    if (!remaining.length) return undefined;
    const timer = setTimeout(() => setDeadlineTick(value => value + 1), Math.min(...remaining) + 50);
    return () => clearTimeout(timer);
  }, [message.sentAt, message.timestamp, message.createdAt]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeMenu = event => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && menuRef.current?.contains(event.target)) return;
      setMenuOpen(false);
      if (event.type === 'pointerdown' && event.button === 0) {
        event.preventDefault();
        event.stopPropagation();
        const blockClick = clickEvent => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
        };
        document.addEventListener('click', blockClick, { capture: true, once: true });
        setTimeout(() => document.removeEventListener('click', blockClick, true), 500);
      }
    };
    document.addEventListener('pointerdown', closeMenu, true);
    document.addEventListener('keydown', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', closeMenu, true);
      document.removeEventListener('keydown', closeMenu);
    };
  }, [menuOpen]);
  useEffect(() => () => clearTimeout(longPressTimer.current), []);
  if (message.isInternalEvent) {
    const eventDate = new Date(message.timestamp || message.createdAt || Date.now()).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const icons = { claimed: 'fa-user-check', unclaimed: 'fa-arrow-rotate-left', closed: 'fa-circle-check', glpi_created: 'fa-circle-check', call_received: 'fa-phone-slash' };
    const glpiEvent = message.internalAction === 'glpi_created' && message.glpiTicketId;
    return <div className="internal-event"><span><i className={`fa-solid ${icons[message.internalAction] || 'fa-circle-info'}`} />{glpiEvent ? <>{message.internalActorName} abriu um chamado <a href={message.glpiTicketUrl} target="_blank" rel="noopener noreferrer">{message.glpiTicketId}</a></> : message.body}<time>{eventDate}</time></span></div>;
  }
  const fromMe = message.fromMe ?? message.sender === 'agent';
  const rawTime = message.timestamp || message.createdAt;
  const parsedTime = rawTime && String(rawTime).includes('T') ? new Date(rawTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : rawTime;
  const time = parsedTime || '';
  const rawBody = message.body || '';
  const encodedMedia = rawBody.length > 512 && /^(?:\/9j\/|iVBORw0KGgo|UklGR|T2dnUw)[A-Za-z0-9+/=\r\n]+$/.test(rawBody);
  const body = encodedMedia ? '[Mídia/Arquivo]' : rawBody;
  const placeholder = body === '[Mídia/Arquivo]';
  const groupSender = message.groupSenderName || message.senderName;
  const ack = Number(message.ack ?? 0);
  const ackLabel = ack >= 4 ? 'Reproduzida' : ack >= 3 ? 'Lida' : ack >= 2 ? 'Entregue' : ack >= 1 ? 'Enviada' : ack < 0 ? 'Falha no envio' : 'Aguardando envio';
  const sentAt = new Date(message.sentAt || message.timestamp || message.createdAt || 0).getTime();
  const messageAge = Number.isFinite(sentAt) ? Math.max(0, Date.now() - sentAt) : Number.POSITIVE_INFINITY;
  const canEdit = fromMe && messageAge <= 15 * 60 * 1000 && Boolean(onEdit) && Boolean(message.whatsappMessageId) && Boolean(body) && !placeholder && !message.deletedAt;
  const canDelete = fromMe && messageAge <= 60 * 60 * 60 * 1000 && Boolean(onDelete) && Boolean(message.whatsappMessageId) && !message.deletedAt;
  const hasOwnActions = canEdit || canDelete;
  const hasMenuActions = Boolean(onReply) || hasOwnActions;
  const toggleMenu = event => {
    const anchor = event.currentTarget.getBoundingClientRect();
    setMenuBelow(anchor.top < 190);
    setMenuOpen(open => !open);
  };
  const openContextMenu = event => {
    if (!hasMenuActions) return;
    event.preventDefault();
    setMenuBelow(event.clientY < 190);
    setMenuOpen(true);
  };
  const startTouchGesture = event => {
    if (event.pointerType !== 'touch') return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (onReply) swipeStart.current = { x: event.clientX, y: event.clientY, vertical: false };
    if (hasMenuActions) {
      longPressStart.current = { x: event.clientX, y: event.clientY };
      clearTimeout(longPressTimer.current);
      const anchorY = event.clientY;
      longPressTimer.current = setTimeout(() => {
        setMenuBelow(anchorY < 190);
        setMenuOpen(true);
        navigator.vibrate?.(20);
      }, 550);
    }
  };
  const moveTouchGesture = event => {
    const start = longPressStart.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
      clearTimeout(longPressTimer.current);
      longPressStart.current = null;
    }

    const swipe = swipeStart.current;
    if (!swipe || swipe.vertical) return;
    const deltaX = event.clientX - swipe.x;
    const deltaY = event.clientY - swipe.y;
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
      swipe.vertical = true;
      setSwipeOffset(0);
      return;
    }
    const directionalDelta = fromMe ? Math.min(0, deltaX) : Math.max(0, deltaX);
    setSwipeOffset(Math.sign(directionalDelta) * Math.min(82, Math.abs(directionalDelta) * 0.82));
  };
  const finishTouchGesture = event => {
    clearTimeout(longPressTimer.current);
    longPressStart.current = null;
    const swipe = swipeStart.current;
    const deltaX = swipe ? event.clientX - swipe.x : 0;
    const directionalDelta = fromMe ? Math.min(0, deltaX) : Math.max(0, deltaX);
    const shouldReply = event.type !== 'pointercancel' && !swipe?.vertical && Math.abs(directionalDelta) >= 66 && Boolean(onReply);
    swipeStart.current = null;
    setSwipeOffset(0);
    if (shouldReply) {
      navigator.vibrate?.(12);
      onReply(message);
    }
  };
  const swipeProgress = Math.min(1, Math.abs(swipeOffset) / 54);
  return <div className={`message-row ${fromMe ? 'mine' : 'theirs'} ${menuOpen ? 'menu-open' : ''} ${swipeOffset ? 'swiping' : ''}`} onContextMenu={openContextMenu} onPointerDown={startTouchGesture} onPointerMove={moveTouchGesture} onPointerUp={finishTouchGesture} onPointerCancel={finishTouchGesture}><span className="swipe-reply-indicator" style={{ opacity: swipeProgress, transform: `scale(${0.7 + swipeProgress * 0.3})` }}><i className="fa-solid fa-reply" /></span><div className="message-actions" ref={menuRef}>{hasOwnActions && <button type="button" className="message-menu-button" onClick={toggleMenu} title="Mais opções" aria-label="Mais opções" aria-expanded={menuOpen}><i className="fa-solid fa-ellipsis-vertical" /></button>}{menuOpen && <div className={`message-context-menu ${menuBelow ? 'open-below' : ''}`} role="menu">{onReply && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onReply(message); }}><i className="fa-solid fa-reply" />Citar</button>}{canEdit && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit(message); }}><i className="fa-solid fa-pen" />Editar</button>}{canDelete && <button type="button" role="menuitem" className="delete-option" onClick={() => { setMenuOpen(false); onDelete(message); }}><i className="fa-solid fa-trash-can" />Apagar para todos</button>}</div>}{onReply && <button type="button" className="reply-message-button" onClick={() => onReply(message)} title="Responder" aria-label="Responder mensagem"><i className="fa-solid fa-reply" /></button>}</div><div className="message-bubble" style={{ transform: `translateX(${swipeOffset}px)` }}>{message.quotedBody && <button type="button" className="quoted-message" onClick={() => onQuotedClick?.(message)} title="Ir para a mensagem citada" aria-label="Ir para a mensagem citada"><strong>{message.quotedSenderName || 'Mensagem'}</strong><span>{message.quotedBody}</span></button>}{isGroup && !fromMe && groupSender && <strong className="group-sender">{groupSender}</strong>}<Media message={message} onImage={onImage} />{body && !(message.mediaUrl && placeholder) && <p><LinkifiedText text={body} /></p>}<span className="message-time">{message.editedAt && <em>editada</em>}{message.deletedAt && <em className="message-deleted"><i className="fa-solid fa-ban" /> apagada</em>}{time}{fromMe && <i title={ackLabel} aria-label={ackLabel} className={`message-ack fa-solid ${ack >= 2 ? 'fa-check-double' : ack < 0 ? 'fa-circle-exclamation' : 'fa-check'} ${ack >= 3 ? 'read' : ''} ${ack < 0 ? 'error' : ''}`} />}</span></div></div>;
}
