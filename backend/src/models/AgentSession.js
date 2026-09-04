const mongoose = require('mongoose');

const AgentSessionSchema = new mongoose.Schema({
    tokenHash: { type: String, required: true, unique: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AgentSession', AgentSessionSchema);
