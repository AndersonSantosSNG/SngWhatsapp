const { Client, LocalAuth } = require('whatsapp-web.js');
const config = require('../../config/whatsapp');

function createWhatsAppClient() {
  return new Client({
    authStrategy: new LocalAuth({ dataPath: config.authPath }),
    webVersionCache: {
      type: 'remote',
      remotePath:
        'https://raw.githubusercontent.com/wppconnect-team/wa-version-check/main/html/2.3000.1018939023-alpha.html',
    },
    puppeteer: {
      ...config.puppeteer,
      headless: true,
      timeout: 120000,
    },
  });
}

module.exports = { createWhatsAppClient };
