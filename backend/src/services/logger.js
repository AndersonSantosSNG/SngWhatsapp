const REDACTED_KEYS = /password|token|secret|authorization|cookie|api[-_]?key/i;

function sanitize(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      REDACTED_KEYS.test(key) ? '[REDACTED]' : sanitize(item, seen),
    ]),
  );
}

function write(level, event, details = {}) {
  const output = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitize(details),
  });
  (level === 'error' ? console.error : console.log)(output);
}

module.exports = {
  info: (event, details) => write('info', event, details),
  error: (event, details) => write('error', event, details),
  sanitize,
};
