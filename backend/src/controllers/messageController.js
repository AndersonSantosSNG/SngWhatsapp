const whatsappService = require('../services/whatsappService');

const handleSendMessage = async (req, res) => {
    const { isClientReady } = whatsappService.getStatus();

    if (!isClientReady) {
        return res.status(503).json({
            error: 'O serviço de WhatsApp não está pronto. Tente novamente em alguns instantes.'
        });
    }

    const { number, message, fileUrl, fileBase64, mimeType, fileName, agentId, replyToMessageId } = req.body;
    const file = req.file;

    if (!number) {
        return res.status(400).json({ error: 'O parâmetro "number" é obrigatório.' });
    }

    if (!message && !file && !fileUrl && !fileBase64) {
        return res.status(400).json({ error: 'Forneça texto, arquivo ou URL para envio.' });
    }

    try {
        await whatsappService.sendMessage({ number, message, file, fileUrl, fileBase64, mimeType, fileName, agentId, replyToMessageId });

        return res.json({ 
            status: 'success',
            message: 'Mensagem adicionada à fila de envio com sucesso.' 
        });
    } catch (err) {
        console.error('Erro no controller de envio:', err);
        return res.status(500).json({ error: 'Falha ao processar requisição', details: err.toString() });
    }
};

module.exports = {
    handleSendMessage
};
