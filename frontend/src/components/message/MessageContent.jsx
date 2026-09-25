export function MessageMedia({ message, onImage }) {
  if (message.pendingUpload) {
    const bytes = Number(message.mediaFileSize || 0);
    const size =
      bytes >= 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        : bytes >= 1024
          ? `${Math.round(bytes / 1024)} KB`
          : bytes
            ? `${bytes} B`
            : '';
    return (
      <div className="file-card file-uploading" role="status" aria-live="polite">
        <span className="file-card-icon">
          <i className="fa-solid fa-file-arrow-up" />
        </span>
        <span className="file-card-details">
          <strong>{message.mediaFileName || 'Arquivo'}</strong>
          <small>{size ? `${size} · ` : ''}Enviando arquivo...</small>
        </span>
        <i className="fa-solid fa-spinner fa-spin file-card-progress" aria-hidden="true" />
      </div>
    );
  }
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
  const rawName = message.mediaFileName || '';
  const looksGenerated = /^[a-f\d]{32,}(?:\.[a-z\d]+)?$/i.test(rawName);
  const typeLabel = mime === 'application/pdf' ? 'Documento PDF' : 'Arquivo anexado';
  const displayName = rawName && !looksGenerated ? rawName : typeLabel;
  return (
    <a className="file-link file-card" href={message.mediaUrl} target="_blank" rel="noreferrer">
      <span className="file-card-icon">
        <i className="fa-solid fa-file-arrow-down" />
      </span>
      <span className="file-card-details">
        <strong>{displayName}</strong>
        <small>Clique para abrir ou baixar</small>
      </span>
    </a>
  );
}

const INLINE_PATTERN =
  /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|__[^_\n]+__|_[^_\n]+_|~~[^~\n]+~~|~[^~\n]+~|```[^`\n]+```|`[^`\n]+`|(?:https?:\/\/|www\.)[^\s<]+)/gi;

function renderMessagePart(part, key) {
  const formats = [
    [/^\*\*([\s\S]+)\*\*$/, 'strong'],
    [/^\*([\s\S]+)\*$/, 'strong'],
    [/^__([\s\S]+)__$/, 'strong'],
    [/^_([\s\S]+)_$/, 'em'],
    [/^~~([\s\S]+)~~$/, 's'],
    [/^~([\s\S]+)~$/, 's'],
    [/^```([\s\S]+)```$/, 'code'],
    [/^`([\s\S]+)`$/, 'code'],
  ];
  for (const [pattern, Element] of formats) {
    const match = part.match(pattern);
    if (match) return <Element key={key}>{renderMessageText(match[1], `${key}-inner`)}</Element>;
  }
  if (/^(?:https?:\/\/|www\.)/i.test(part)) {
    const match = part.match(/^(.*?)([.,!?;:)]+)?$/);
    const url = match?.[1] || part;
    const punctuation = match?.[2] || '';
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return (
      <span key={key}>
        <a className="message-link" href={href} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
        {punctuation}
      </span>
    );
  }
  return part;
}

function renderMessageText(text, keyPrefix = 'message') {
  return String(text)
    .split(INLINE_PATTERN)
    .filter((part) => part !== '')
    .map((part, index) => renderMessagePart(part, `${keyPrefix}-${index}`));
}

export function LinkifiedText({ text }) {
  return renderMessageText(text);
}
