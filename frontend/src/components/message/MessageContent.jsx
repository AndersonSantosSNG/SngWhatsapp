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
