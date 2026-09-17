const crypto = require('crypto');
const ApiClient = require('../models/ApiClient');

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return (
    leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

const checkApiKey = async (req, res, next) => {
  try {
    const apiKey = String(req.headers['x-api-key'] || '');
    if (!apiKey) return res.status(401).json({ error: 'Chave de API ausente.' });
    if (process.env.API_SECRET_KEY && safeEqual(apiKey, process.env.API_SECRET_KEY)) {
      req.apiClient = { name: 'legacy-master-key' };
      return next();
    }

    const apiClient = await ApiClient.findOne({ keyHash: hashApiKey(apiKey), active: true }).select(
      '+keyHash',
    );
    if (!apiClient) return res.status(401).json({ error: 'Chave de API inválida ou bloqueada.' });

    const requestOrigin = req.get('origin');
    if (requestOrigin && requestOrigin !== apiClient.allowedOrigin) {
      return res.status(403).json({ error: 'Este site não está autorizado a usar esta chave.' });
    }

    req.apiClient = apiClient;
    ApiClient.updateOne({ _id: apiClient._id }, { $set: { lastUsedAt: new Date() } }).catch(
      () => {},
    );
    next();
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível validar a chave de API.' });
  }
};

module.exports = checkApiKey;
module.exports.hashApiKey = hashApiKey;
