const mongoose = require('mongoose');

const PasswordResetSchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
  codeHash: { type: String, required: true, select: false },
  codeSalt: { type: String, required: true, select: false },
  attempts: { type: Number, default: 0 },
  blocked: { type: Boolean, default: false },
  verifiedAt: { type: Date, default: null },
  resetTokenHash: { type: String, default: '', select: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('PasswordReset', PasswordResetSchema);
