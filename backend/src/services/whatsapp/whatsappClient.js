const { Client, LocalAuth } = require('whatsapp-web.js');
const config = require('../../config/whatsapp');

function createWhatsAppClient() {
  return new Client({
    authStrategy: new LocalAuth({ dataPath: config.authPath }),
    webVersion: config.webVersion,
    webVersionCache: {
      type: 'remote',
      remotePath: config.webVersionCacheUrl,
      strict: config.webVersionCacheStrict,
    },
    puppeteer: {
      ...config.puppeteer,
      headless: true,
      timeout: 120000,
    },
  });
}

module.exports = { createWhatsAppClient };
