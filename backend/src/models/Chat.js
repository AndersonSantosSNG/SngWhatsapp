const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema(
  {
    phoneNumber: { type: String, required: true, unique: true },
    whatsappId: { type: String, default: '' },
    contactName: { type: String, default: '' },
    isGroup: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'open', 'closed'], default: 'pending' },
    assignedAgent: { type: String, default: null },
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now },
    profilePicUrl: { type: String, default: '' },
    isTemporary: { type: Boolean, default: false },
  },
  { collection: 'tickets' },
);

ChatSchema.index({ status: 1, updatedAt: -1 });
ChatSchema.index({ assignedAgent: 1, updatedAt: -1 });
ChatSchema.index({ status: 1, lastMessageAt: -1, _id: -1 });
ChatSchema.index({ status: 1, updatedAt: -1, _id: -1 });

module.exports = mongoose.models.Chat || mongoose.model('Chat', ChatSchema);
