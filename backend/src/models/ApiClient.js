const mongoose = require('mongoose');

const ApiClientSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    allowedOrigin: { type: String, required: true, trim: true },
    keyHash: { type: String, required: true, unique: true, select: false },
    keyPrefix: { type: String, required: true },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: null }
});

module.exports = mongoose.model('ApiClient', ApiClientSchema);
