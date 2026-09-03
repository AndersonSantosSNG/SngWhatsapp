const QRCode = require('qrcode');
const whatsappService = require('../services/whatsappService');

const getQrCodeJson = (req, res) => {
    const { isClientReady, currentQrCode } = whatsappService.getStatus();

    if (isClientReady) {
        return res.json({ connected: true, message: 'WhatsApp já está conectado.' });
    }
    if (!currentQrCode) {
        return res.status(503).json({ connected: false, error: 'QR Code ainda não gerado. Aguarde...' });
    }
    return res.json({ connected: false, qr: currentQrCode });
};

const getQrCodeImage = async (req, res) => {
    const { isClientReady, currentQrCode } = whatsappService.getStatus();

    if (isClientReady) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send('<h2>O WhatsApp já está conectado e pronto para uso.</h2>');
    }

    if (!currentQrCode) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(503).send('<h2>Aguardando geração do QR Code... Recarregue em instantes.</h2>');
    }

    try {
        const qrBuffer = await QRCode.toBuffer(currentQrCode, { type: 'png', margin: 2, scale: 8 });
        res.setHeader('Content-Type', 'image/png');
        return res.send(qrBuffer);
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao renderizar imagem do QR Code.' });
    }
};

module.exports = {
    getQrCodeJson,
    getQrCodeImage
};