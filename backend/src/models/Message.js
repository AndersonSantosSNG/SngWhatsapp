const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true },
    phoneNumber: { type: String, required: true },
    whatsappMessageId: { type: String, default: '', index: true },
    sender: { type: String, enum: ['client', 'agent'], required: true },
    body: { type: String, required: true },
    ack: { type: Number, default: 0 },
    hasMedia: { type: Boolean, default: false },
    mediaPath: { type: String, default: '' },
    mediaMimeType: { type: String, default: '' },
    mediaFileName: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', MessageSchema);
