const path = require('path');

module.exports = {
  authPath: path.join(__dirname, '..', '..', '..', 'sessions'),
  webVersion: process.env.WHATSAPP_WEB_VERSION || '2.3000.1018939023-alpha',
  webVersionCacheUrl:
    process.env.WHATSAPP_WEB_CACHE_URL ||
    'https://raw.githubusercontent.com/wppconnect-team/wa-version-check/main/html/{version}.html',
  webVersionCacheStrict: process.env.WHATSAPP_WEB_CACHE_STRICT === 'true',
  puppeteer: {
    headless: true,
    protocolTimeout: 120000,
    args: [
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--disable-gpu',
      '--no-default-browser-check',
      '--disable-infobars',
    ],
  },
};

if (process.env.CHROMIUM_DISABLE_SANDBOX === 'true') {
  module.exports.puppeteer.args.push('--no-sandbox', '--disable-setuid-sandbox', '--no-zygote');
}
