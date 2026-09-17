const crypto = require('crypto');
const AuditLog = require('../models/AuditLog');

const SENSITIVE_FIELDS = /password|token|secret|authorization|cookie|api.?key|filebase64/i;
const CONTENT_FIELDS = /^(message|body|caption)$/i;

function sanitizeAuditValue(value, key = '', depth = 0) {
  if (SENSITIVE_FIELDS.test(key)) return '[REDACTED]';
  if (CONTENT_FIELDS.test(key)) return `[CONTENT REDACTED:${String(value || '').length}]`;
  if (depth >= 3) return '[TRUNCATED]';
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeAuditValue(item, key, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([childKey, childValue]) => [
          childKey,
          sanitizeAuditValue(childValue, childKey, depth + 1),
        ]),
    );
  }
  if (typeof value === 'string') return value.slice(0, 500);
  return value;
}

function audit(req, action, options = {}) {
  req.auditRecorded = true;
  return AuditLog.create({
    action,
    actorId: req.agent?._id || options.actorId || null,
    actorName: req.agent?.name || options.actorName || '',
    actorType:
      req.agent || options.actorId
        ? 'agent'
        : req.apiClient
          ? 'api_client'
          : options.actorType || 'anonymous',
    targetType: options.targetType || '',
    targetId: String(options.targetId || ''),
    success: options.success !== false,
    requestId: req.auditRequestId || '',
    method: req.method || '',
    path: req.originalUrl?.split('?')[0] || '',
    statusCode: options.statusCode || (options.success === false ? 400 : 200),
    durationMs: req.auditStartedAt ? Date.now() - req.auditStartedAt : 0,
    ip: req.ip || '',
    userAgent: req.get?.('user-agent') || '',
    details: options.details || {},
  }).catch((err) => console.error('[AUDITORIA]', err.message));
}

function auditMiddleware(req, res, next) {
  if (req.path === '/health') return next();

  const startedAt = Date.now();
  req.auditStartedAt = startedAt;
  req.auditRequestId = String(req.get('x-request-id') || crypto.randomUUID()).slice(0, 128);
  res.setHeader('X-Request-Id', req.auditRequestId);
  res.once('finish', () => {
    if (req.auditRecorded) return;
    const routePath = req.route?.path || req.path;
    AuditLog.create({
      action: 'api.request',
      actorId: req.agent?._id || null,
      actorName: req.agent?.name || req.apiClient?.name || '',
      actorType: req.agent ? 'agent' : req.apiClient ? 'api_client' : 'anonymous',
      targetType: 'route',
      targetId: `${req.method} ${routePath}`,
      success: res.statusCode < 400,
      requestId: req.auditRequestId,
      method: req.method,
      path: `${req.baseUrl || ''}${routePath}`,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip || '',
      userAgent: req.get('user-agent') || '',
      details: {
        params: sanitizeAuditValue(req.params || {}),
        query: sanitizeAuditValue(req.query || {}),
        body: sanitizeAuditValue(req.body || {}),
        file: req.file
          ? { name: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size }
          : undefined,
      },
    }).catch((err) => console.error('[AUDITORIA]', err.message));
  });
  next();
}

module.exports = { audit, auditMiddleware, sanitizeAuditValue };
