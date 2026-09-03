const path = require('path');

module.exports = {
    authPath: path.join(__dirname, '..', '..', '..', 'sessions'),
    puppeteer: {
        headless: true,
        protocolTimeout: 120000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--no-default-browser-check',
            '--disable-infobars',
            '--disable-web-security',
            '--disable-site-isolation-trials'
        ]
    }
};
