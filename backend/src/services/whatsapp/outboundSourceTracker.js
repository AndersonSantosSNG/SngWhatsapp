const pending = [];
const MAX_AGE_MS = 2 * 60 * 1000;

function normalize(value) {
  return String(value || '').replace(/\D/g, '');
}

function registerApiSend(number, message = '', apiClientOrigin = '') {
  const entry = {
    phoneNumber: normalize(number),
    message: String(message || ''),
    apiClientOrigin,
    createdAt: Date.now(),
  };
  pending.push(entry);
  setTimeout(() => {
    const index = pending.indexOf(entry);
    if (index >= 0) pending.splice(index, 1);
  }, MAX_AGE_MS);
  return () => {
    const index = pending.indexOf(entry);
    if (index >= 0) pending.splice(index, 1);
  };
}

function takeOutboundSource(target, message = '') {
  const phoneNumber = normalize(target);
  const body = String(message || '');
  const now = Date.now();
  const index = pending.findIndex(
    (entry) =>
      now - entry.createdAt <= MAX_AGE_MS &&
      entry.phoneNumber === phoneNumber &&
      (!entry.message || !body || entry.message === body || body.endsWith(`: ${entry.message}`)),
  );
  if (index < 0) return { source: 'whatsapp', apiClientOrigin: '' };
  const [entry] = pending.splice(index, 1);
  return { source: 'api', apiClientOrigin: entry.apiClientOrigin };
}

module.exports = { registerApiSend, takeOutboundSource };
