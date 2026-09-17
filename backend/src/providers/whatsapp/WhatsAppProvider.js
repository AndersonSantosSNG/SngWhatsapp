class WhatsAppProvider {
  async sendText() {
    throw new Error('sendText deve ser implementado pelo provider.');
  }
  async sendMedia() {
    throw new Error('sendMedia deve ser implementado pelo provider.');
  }
  async markAsRead() {
    throw new Error('markAsRead deve ser implementado pelo provider.');
  }
  getStatus() {
    throw new Error('getStatus deve ser implementado pelo provider.');
  }
}

module.exports = WhatsAppProvider;
