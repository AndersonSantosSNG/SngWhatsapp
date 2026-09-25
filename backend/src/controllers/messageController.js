const whatsappService = require('../services/whatsappService');
const messageService = require('../services/messageService');
const { validateUploadedFile } = require('../services/fileValidation');
const { audit } = require('../middlewares/audit');
const dns = require('dns').promises;

const BLOCKED_UPLOAD_MIME =
  /^(text\/html|image\/svg\+xml|application\/(javascript|x-javascript|x-msdownload))$/i;

function isPrivateAddress(address) {
  return (
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|::1$|fc|fd|fe80)/i.test(address) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  );
}

async function validateRemoteFileUrl(value) {
  if (!value) return;
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('A URL do arquivo deve usar HTTPS.');
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('A URL do arquivo aponta para uma rede não permitida.');
  }
}

const handleSendMessage = async (req, res) => {
  const { isClientReady } = whatsappService.getStatus();

  if (!isClientReady) {
    return res.status(503).json({
      error: 'O serviço de WhatsApp não está pronto. Tente novamente em alguns instantes.',
    });
  }

  const {
    number,
    message,
    fileUrl,
    fileBase64,
    mimeType,
    fileName,
    agentId,
    replyToMessageId,
    sendAudioAsVoice,
    isClosingMessage,
  } = req.body;
  const file = req.file;

  if (!number) {
    return res.status(400).json({ error: 'O parâmetro "number" é obrigatório.' });
  }

  if (!message && !file && !fileUrl && !fileBase64) {
    return res.status(400).json({ error: 'Forneça texto, arquivo ou URL para envio.' });
  }

  try {
    if (String(message || '').length > 4096) throw new Error('A mensagem é muito longa.');
    if (BLOCKED_UPLOAD_MIME.test(String(file?.mimetype || mimeType || ''))) {
      throw new Error('Este tipo de arquivo não é permitido.');
    }
    validateUploadedFile(file);
    if (fileBase64 && Buffer.byteLength(fileBase64, 'base64') > 15 * 1024 * 1024) {
      throw new Error('O arquivo excede o limite de 15 MB.');
    }
    await validateRemoteFileUrl(fileUrl);
    const delivery = await messageService.sendMessage(
      {
        number,
        message,
        file,
        fileUrl,
        fileBase64,
        mimeType,
        fileName,
        agentId,
        replyToMessageId,
        sendAudioAsVoice: sendAudioAsVoice === true || sendAudioAsVoice === 'true',
        isClosingMessage: isClosingMessage === true || isClosingMessage === 'true',
        source: req.apiClient ? 'api' : 'panel',
        apiClientOrigin: req.apiClient?.allowedOrigin || req.get('origin') || '',
      },
      req.get('Idempotency-Key') || req.body.idempotencyKey,
    );

    await audit(req, 'message.send', {
      targetType: 'chat',
      targetId: String(number),
      details: {
        number,
        replyToMessageId: replyToMessageId || '',
        hasAttachment: Boolean(file || fileUrl || fileBase64),
        agentId: agentId || req.agent?._id?.toString() || '',
      },
    });

    return res.json({
      status: 'success',
      message: delivery.duplicate
        ? 'Esta requisição já foi processada anteriormente.'
        : 'Mensagem adicionada à fila de envio com sucesso.',
      idempotencyKey: delivery.idempotencyKey,
      deliveryStatus: delivery.status,
      duplicate: delivery.duplicate,
    });
  } catch (err) {
    console.error('Erro no controller de envio:', err);
    return res
      .status(err.statusCode || 500)
      .json({ error: 'Falha ao processar requisição', details: err.toString() });
  }
};

module.exports = {
  handleSendMessage,
};
