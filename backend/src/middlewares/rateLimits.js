const { rateLimit } = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
});

const externalSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, error: 'Limite de envios excedido. Tente novamente em instantes.' },
});

module.exports = { externalSendLimiter, loginLimiter };
