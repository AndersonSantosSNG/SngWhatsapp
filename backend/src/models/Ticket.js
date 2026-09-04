const mongoose = require('mongoose');

const TicketSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true },
    whatsappId: { type: String, default: '' },
    contactName: { type: String, default: '' },
    isGroup: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'open', 'closed'], default: 'pending' },
    assignedAgent: { type: String, default: null }, // <-- Aqui está como assignedAgent
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now },
    profilePicUrl: { type: String, default: '' },
    isTemporary: { type: Boolean, default: false }
});

TicketSchema.index({ status: 1, updatedAt: -1 });
TicketSchema.index({ assignedAgent: 1, updatedAt: -1 });

module.exports = mongoose.model('Ticket', TicketSchema);
