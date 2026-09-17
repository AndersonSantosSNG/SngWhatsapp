const crypto = require('crypto');
const OutboundMessage = require('../models/OutboundMessage');
const whatsappProvider = require('../providers/whatsapp');
const metrics = require('./metricsService');
const logger = require('./logger');

function normalizeKey(value) {
  const key = String(value || '').trim();
  if (!key) return crypto.randomUUID();
  if (key.length > 128 || !/^[\w.:@-]+$/.test(key)) {
    const error = new Error('Chave de idempotencia invalida.');
    error.statusCode = 400;
    throw error;
  }
  return key;
}

async function sendMessage(payload, requestedKey) {
  const idempotencyKey = normalizeKey(requestedKey);
  let outbox;
  try {
    outbox = await OutboundMessage.create({
      idempotencyKey,
      phoneNumber: String(payload.number || ''),
      ticketId: payload.ticketId || null,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await OutboundMessage.findOne({ idempotencyKey }).lean();
    return { duplicate: true, idempotencyKey, status: existing?.status || 'PENDING' };
  }
  const startedAt = Date.now();
  try {
    outbox.status = 'PROCESSING';
    outbox.updatedAt = new Date();
    await outbox.save();
    const hasMedia = Boolean(payload.file || payload.fileUrl || payload.fileBase64);
    const result = hasMedia
      ? await whatsappProvider.sendMedia(payload.number, payload, payload.message, payload)
      : await whatsappProvider.sendText(payload.number, payload.message, payload);
    outbox.status = 'SENT';
    outbox.sentAt = new Date();
    outbox.updatedAt = new Date();
    await outbox.save();
    metrics.increment('messages_sent_total');
    metrics.gauge('message_send_latency_ms', Date.now() - startedAt);
    return { result, duplicate: false, idempotencyKey, status: outbox.status };
  } catch (error) {
    outbox.status = 'FAILED';
    outbox.retryCount += 1;
    outbox.lastError = String(error?.message || error).slice(0, 500);
    outbox.updatedAt = new Date();
    await outbox.save().catch(() => {});
    metrics.increment('messages_failed_total');
    logger.error('whatsapp_send_failed', {
      outboxId: outbox._id.toString(),
      provider: outbox.provider,
      errorCode: error?.code || 'SEND_ERROR',
    });
    throw error;
  }
}

module.exports = { sendMessage, normalizeKey };
