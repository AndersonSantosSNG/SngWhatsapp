const WhatsAppWebProvider = require('./WhatsAppWebProvider');
const whatsappService = require('../../services/whatsappService');

module.exports = new WhatsAppWebProvider(whatsappService);
