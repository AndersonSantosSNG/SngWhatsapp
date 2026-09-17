const path = require('path');

module.exports = {
  authPath: path.join(__dirname, '..', '..', '..', 'sessions'),
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
