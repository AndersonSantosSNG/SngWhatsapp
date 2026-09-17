const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  phoneNumber: { type: String, required: true },
  whatsappMessageId: { type: String, default: '', index: true },
  idempotencyKey: { type: String, default: null },
  deliveryStatus: {
    type: String,
    enum: ['received', 'pending', 'sent', 'failed'],
    default: 'received',
  },
  retryCount: { type: Number, default: 0 },
  lastDeliveryError: { type: String, default: '' },
  sender: { type: String, enum: ['client', 'agent'], required: true },
  source: { type: String, enum: ['whatsapp', 'panel', 'api'], default: 'whatsapp', index: true },
  apiClientOrigin: { type: String, default: '' },
  groupSenderId: { type: String, default: '' },
  groupSenderName: { type: String, default: '' },
  quotedMessageId: { type: String, default: '' },
  quotedWhatsappMessageId: { type: String, default: '' },
  quotedBody: { type: String, default: '' },
  quotedSenderName: { type: String, default: '' },
  isInternalEvent: { type: Boolean, default: false },
  internalAction: {
    type: String,
    enum: [
      '',
      'claimed',
      'unclaimed',
      'closed',
      'glpi_created',
      'call_received',
      'call_made',
      'call_missed',
      'call_rejected',
    ],
    default: '',
  },
  internalActorName: { type: String, default: '' },
  glpiTicketId: { type: String, default: '' },
  glpiTicketUrl: { type: String, default: '' },
  body: { type: String, required: true },
  ack: { type: Number, default: 0 },
  hasMedia: { type: Boolean, default: false },
  mediaPath: { type: String, default: '' },
  mediaMimeType: { type: String, default: '' },
  mediaFileName: { type: String, default: '' },
  editedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  timestamp: { type: Date, default: Date.now },
});

MessageSchema.index({ ticketId: 1, timestamp: -1 });
MessageSchema.index({ phoneNumber: 1, timestamp: -1 });
MessageSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

module.exports = mongoose.model('Message', MessageSchema);
