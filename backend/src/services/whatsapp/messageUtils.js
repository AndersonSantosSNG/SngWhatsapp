function getWhatsAppMessageId(message) {
  const id = message?.id;
  if (!id) return '';
  if (typeof id === 'string') return id;
  if (id._serialized) return id._serialized;
  if (id.$1) return id.$1;

  const messageId = id.id || '';
  const remote = id.remote || message.to || message.from || '';
  return messageId && remote ? `${id.fromMe ? 'true' : 'false'}_${remote}_${messageId}` : messageId;
}

function mergeMessageAck(previousAck, nextAck) {
  if (nextAck === -1) return -1;
  if (previousAck === -1) return nextAck;
  return Math.max(previousAck ?? 0, nextAck ?? 0);
}

function isWithinMessageWindow(message, windowMs) {
  const sentAt = new Date(message.timestamp || message.createdAt || 0).getTime();
  return Number.isFinite(sentAt) && Date.now() - sentAt <= windowMs;
}

function isCallLogMessage(message) {
  return message?.type === 'call_log' || message?._data?.type === 'call_log';
}

function getStoredHistoryMessageId(message) {
  const id = getWhatsAppMessageId(message);
  return id && isCallLogMessage(message) ? `call-log:${id}` : id;
}

function getCallEventDetails(call) {
  const fromMe = Boolean(call.fromMe ?? call.outgoing);
  const isVideo = Boolean(call.isVideo ?? call.isVideoCall);
  const outcome = String(
    call.outcome || call.callOutcome || call.callStatus || call.subtype || '',
  ).toLowerCase();
  const duration = Number(call.duration || call.callDuration || 0);
  const callKind = isVideo ? 'vídeo' : 'voz';
  const rejected = /reject|declin|refus|deny/.test(outcome);
  const missed = /miss|timeout|no.?answer|unanswered/.test(outcome);
  const answered = duration > 0 || /accept|connect|answer|complete/.test(outcome);
  let internalAction;
  let body;

  if (rejected) {
    internalAction = 'call_rejected';
    body = `Chamada de ${callKind} negada`;
  } else if (!fromMe && (missed || (call.isFinal && !answered))) {
    internalAction = 'call_missed';
    body = `Chamada de ${callKind} perdida`;
  } else if (fromMe) {
    internalAction = 'call_made';
    body = `Chamada de ${callKind} realizada`;
  } else {
    internalAction = 'call_received';
    body = `Chamada de ${callKind} recebida`;
  }
  if (duration > 0) {
    body += ` (${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')})`;
  }
  return { fromMe, internalAction, body };
}

function getCallSignature(peerId, body, timestamp) {
  const timeBucket = Math.floor(new Date(timestamp).getTime() / 5000);
  return `${peerId || ''}|${body || ''}|${timeBucket}`;
}

function dedupeCallEvents(messages) {
  const seen = new Set();
  return messages.filter((message) => {
    if (!message.isInternalEvent || !String(message.internalAction || '').startsWith('call_')) {
      return true;
    }
    const signature = getCallSignature(
      message.ticketId,
      message.body,
      message.timestamp || message.createdAt,
    );
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

module.exports = {
  dedupeCallEvents,
  getCallEventDetails,
  getCallSignature,
  getStoredHistoryMessageId,
  getWhatsAppMessageId,
  isCallLogMessage,
  isWithinMessageWindow,
  mergeMessageAck,
};
