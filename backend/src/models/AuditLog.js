const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  action: { type: String, required: true, index: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null, index: true },
  actorName: { type: String, default: '' },
  actorType: {
    type: String,
    enum: ['anonymous', 'agent', 'api_client', 'system'],
    default: 'anonymous',
    index: true,
  },
  targetType: { type: String, default: '' },
  targetId: { type: String, default: '' },
  success: { type: Boolean, default: true },
  requestId: { type: String, default: '', index: true },
  method: { type: String, default: '' },
  path: { type: String, default: '' },
  statusCode: { type: Number, default: 0 },
  durationMs: { type: Number, default: 0 },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true },
});

AuditLogSchema.index({ createdAt: -1, action: 1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
