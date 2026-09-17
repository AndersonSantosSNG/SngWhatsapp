export function MessageMedia({ message, onImage }) {
  if (!message.mediaUrl) return null;
  const mime = message.mediaMimeType || '';
  if (mime.startsWith('image/')) {
    return (
      <img
        className="message-image"
        src={message.mediaUrl}
        alt="Mídia"
        onClick={() => onImage(message.mediaUrl)}
      />
    );
  }
  if (mime.startsWith('video/')) {
    return <video className="message-video" src={message.mediaUrl} controls />;
  }
  if (mime.startsWith('audio/')) {
    return (
      <div className="message-audio">
        <div className="message-audio-heading">
          <span className="message-audio-icon">
            <i className="fa-solid fa-microphone" aria-hidden="true" />
          </span>
          <span>Mensagem de voz</span>
        </div>
        <audio
          src={message.mediaUrl}
          controls
          preload="metadata"
          aria-label="Reproduzir áudio da mensagem"
        />
      </div>
    );
  }
  return (
    <a className="file-link" href={message.mediaUrl} target="_blank" rel="noreferrer">
      <i className="fa-solid fa-file-arrow-down" /> {message.mediaFileName || 'Baixar arquivo'}
    </a>
  );
}

export function LinkifiedText({ text }) {
  const urlPattern = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
  return String(text)
    .split(urlPattern)
    .map((part, index) => {
      if (!/^(?:https?:\/\/|www\.)/i.test(part)) return part;
      const match = part.match(/^(.*?)([.,!?;:)]+)?$/);
      const url = match?.[1] || part;
      const punctuation = match?.[2] || '';
      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      return (
        <span key={`${url}-${index}`}>
          <a className="message-link" href={href} target="_blank" rel="noopener noreferrer">
            {url}
          </a>
          {punctuation}
        </span>
      );
    });
}
