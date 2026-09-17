const WhatsAppProvider = require('./WhatsAppProvider');

class WhatsAppWebProvider extends WhatsAppProvider {
  constructor(service) {
    super();
    this.service = service;
  }
  sendText(to, text, options = {}) {
    return this.service.sendMessage({ number: to, message: text, ...options });
  }
  sendMedia(to, media, caption = '', options = {}) {
    return this.service.sendMessage({ number: to, message: caption, ...media, ...options });
  }
  markAsRead(chatId) {
    return this.service.markAsRead ? this.service.markAsRead(chatId) : Promise.resolve(false);
  }
  getStatus() {
    return this.service.getStatus();
  }
}

module.exports = WhatsAppWebProvider;
