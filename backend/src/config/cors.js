const ApiClient = require('../models/ApiClient');

const DEFAULT_PANEL_ORIGIN = 'https://whatsapp.sng.com.br';

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function panelOrigins() {
  const developmentOrigins =
    process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'];
  return new Set(
    [DEFAULT_PANEL_ORIGIN, ...developmentOrigins, ...(process.env.PANEL_ORIGINS || '').split(',')]
      .map(normalizeOrigin)
      .filter(Boolean),
  );
}

async function classifyOrigin(origin) {
  if (!origin) return 'non-browser';
  const normalized = normalizeOrigin(origin);
  if (!normalized) return '';
  if (panelOrigins().has(normalized)) return 'panel';
  const client = await ApiClient.exists({ allowedOrigin: normalized, active: true });
  return client ? 'api-client' : '';
}

function httpCorsOptions(req, callback) {
  classifyOrigin(req.get('origin'))
    .then((kind) => {
      if (!kind) return callback(new Error('Origem não autorizada pelo CORS.'));
      callback(null, {
        origin: kind === 'non-browser' ? false : req.get('origin'),
        credentials: kind === 'panel',
        methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-Id'],
        maxAge: 600,
      });
    })
    .catch(callback);
}

function socketCorsOrigin(origin, callback) {
  const allowed = !origin || panelOrigins().has(normalizeOrigin(origin));
  callback(allowed ? null : new Error('Origem do WebSocket não autorizada.'), allowed);
}

module.exports = {
  DEFAULT_PANEL_ORIGIN,
  classifyOrigin,
  httpCorsOptions,
  normalizeOrigin,
  socketCorsOrigin,
};
