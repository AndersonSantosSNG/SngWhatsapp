const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, error: 'Muitas solicitacoes. Aguarde 15 minutos.' },
});

const externalSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.apiClient?._id?.toString() || req.apiClient?.name || ipKeyGenerator(req.ip),
  message: { success: false, error: 'Limite de envios excedido. Tente novamente em instantes.' },
});

module.exports = { externalSendLimiter, loginLimiter, passwordResetLimiter };
