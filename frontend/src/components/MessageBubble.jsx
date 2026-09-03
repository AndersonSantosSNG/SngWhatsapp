function Media({ message, onImage }) {
  if (!message.mediaUrl) return null;
  const mime = message.mediaMimeType || '';
  if (mime.startsWith('image/')) return <img className="message-image" src={message.mediaUrl} alt="Mídia" onClick={() => onImage(message.mediaUrl)} />;
  if (mime.startsWith('video/')) return <video className="message-video" src={message.mediaUrl} controls />;
  if (mime.startsWith('audio/')) return <audio src={message.mediaUrl} controls />;
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

export default function MessageBubble({ message, onImage }) {
  const fromMe = message.fromMe ?? message.sender === 'agent';
  const rawTime = message.timestamp || message.createdAt;
  const parsedTime = rawTime && String(rawTime).includes('T') ? new Date(rawTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : rawTime;
  const time = parsedTime || '';
  const placeholder = message.body === '[Mídia/Arquivo]';
  return <div className={`message-row ${fromMe ? 'mine' : 'theirs'}`}><div className="message-bubble"><Media message={message} onImage={onImage} />{message.body && !(message.mediaUrl && placeholder) && <p><LinkifiedText text={message.body} /></p>}<span className="message-time">{time}{fromMe && <i className={`fa-solid ${message.ack >= 2 ? 'fa-check-double' : message.ack < 0 ? 'fa-circle-exclamation' : 'fa-check'}`} />}</span></div></div>;
}
