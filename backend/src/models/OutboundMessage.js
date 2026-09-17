const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  idempotencyKey: { type: String, required: true, unique: true, index: true },
  provider: { type: String, default: 'whatsapp-web' },
  phoneNumber: { type: String, required: true, index: true },
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', default: null, index: true },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'SENT', 'FAILED'],
    default: 'PENDING',
    index: true,
  },
  retryCount: { type: Number, default: 0 },
  lastError: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  sentAt: { type: Date, default: null },
});

schema.index({ status: 1, createdAt: 1 });
module.exports = mongoose.models.OutboundMessage || mongoose.model('OutboundMessage', schema);
