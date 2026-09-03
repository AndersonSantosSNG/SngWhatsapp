const mongoose = require('mongoose');

const AgentSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    corporateEmail: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    passwordSalt: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'agent'], default: 'agent' },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Agent', AgentSchema);
