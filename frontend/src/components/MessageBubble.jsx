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

export default function MessageBubble({ message, isGroup, onImage, onReply, onQuotedClick }) {
  if (message.isInternalEvent) {
    const eventDate = new Date(message.timestamp || message.createdAt || Date.now()).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const icons = { claimed: 'fa-user-check', unclaimed: 'fa-arrow-rotate-left', closed: 'fa-circle-check', glpi_created: 'fa-circle-check' };
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
  return <div className={`message-row ${fromMe ? 'mine' : 'theirs'}`}>{onReply && <button type="button" className="reply-message-button" onClick={() => onReply(message)} title="Responder" aria-label="Responder mensagem"><i className="fa-solid fa-reply" /></button>}<div className="message-bubble">{message.quotedBody && <button type="button" className="quoted-message" onClick={() => onQuotedClick?.(message)} title="Ir para a mensagem citada" aria-label="Ir para a mensagem citada"><strong>{message.quotedSenderName || 'Mensagem'}</strong><span>{message.quotedBody}</span></button>}{isGroup && !fromMe && groupSender && <strong className="group-sender">{groupSender}</strong>}<Media message={message} onImage={onImage} />{body && !(message.mediaUrl && placeholder) && <p><LinkifiedText text={body} /></p>}<span className="message-time">{time}{fromMe && <i title={ackLabel} aria-label={ackLabel} className={`message-ack fa-solid ${ack >= 2 ? 'fa-check-double' : ack < 0 ? 'fa-circle-exclamation' : 'fa-check'} ${ack >= 3 ? 'read' : ''} ${ack < 0 ? 'error' : ''}`} />}</span></div></div>;
}
