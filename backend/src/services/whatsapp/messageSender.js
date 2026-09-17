const { MessageMedia } = require('whatsapp-web.js');
const Agent = require('../../models/Agent');
const Message = require('../../models/Message');
const { addToQueue } = require('../queueService');
const { convertVoiceAudio } = require('../audioService');
const { sendAudio } = require('../audioSendService');

function createMessageSender({ getClient, isReady, pendingOutgoingMedia }) {
  return async function sendMessage({
    number,
    message,
    file,
    fileUrl,
    fileBase64,
    mimeType,
    fileName,
    agentId,
    replyToMessageId,
    sendAudioAsVoice,
    isClosingMessage,
  }) {
    const client = getClient();
    if (!isReady() || !client) {
      throw new Error(
        'O serviço de WhatsApp não está pronto. Tente novamente em alguns instantes.',
      );
    }

    let messageToSend = message || '';
    if (agentId) {
      const agent = await Agent.findOne({ _id: agentId, active: true });
      if (!agent) throw new Error('Agente nao encontrado ou inativo.');
      if (sendAudioAsVoice !== true && isClosingMessage !== true) {
        messageToSend = `${agent.name}: ${messageToSend}`;
      }
    }

    const cleanId = number.replace(/\D/g, '');
    let targetJid;
    if (number.includes('@g.us')) {
      targetJid = number;
    } else {
      const resolvedId = await client.getNumberId(cleanId);
      targetJid = resolvedId?._serialized || `${cleanId}@c.us`;
    }

    return addToQueue(async () => {
      const options = {};
      if (replyToMessageId) {
        const quotedMessage = await Message.findById(replyToMessageId);
        if (quotedMessage?.whatsappMessageId) {
          options.quotedMessageId = quotedMessage.whatsappMessageId;
        }
      }

      let payloadToSend = messageToSend;
      if (file) {
        payloadToSend = new MessageMedia(
          file.mimetype,
          file.buffer.toString('base64'),
          file.originalname,
        );
        if (messageToSend) options.caption = messageToSend;
      } else if (fileUrl) {
        payloadToSend = await MessageMedia.fromUrl(fileUrl, { unsafeMime: true });
        if (messageToSend) options.caption = messageToSend;
      } else if (fileBase64) {
        payloadToSend = new MessageMedia(
          mimeType || 'application/octet-stream',
          fileBase64,
          fileName || 'arquivo',
        );
        if (messageToSend) options.caption = messageToSend;
      }

      if (sendAudioAsVoice === true) {
        if (
          !(payloadToSend instanceof MessageMedia) ||
          !payloadToSend.mimetype.startsWith('audio/')
        ) {
          throw new Error('Forneça um arquivo de áudio para enviar como mensagem de voz.');
        }
        const voiceData = await convertVoiceAudio(payloadToSend.data);
        payloadToSend = new MessageMedia('audio/ogg; codecs=opus', voiceData, 'audio.ogg');
        options.sendAudioAsVoice = true;
        delete options.caption;
      }

      let pendingMedia = null;
      if (payloadToSend instanceof MessageMedia) {
        pendingMedia = {
          targetJid,
          createdAt: Date.now(),
          media: {
            data: payloadToSend.data,
            mimetype: payloadToSend.mimetype,
            filename: payloadToSend.filename,
          },
        };
        pendingOutgoingMedia.push(pendingMedia);
        setTimeout(() => {
          const index = pendingOutgoingMedia.indexOf(pendingMedia);
          if (index >= 0) pendingOutgoingMedia.splice(index, 1);
        }, 60000);
      }

      try {
        if (payloadToSend instanceof MessageMedia && payloadToSend.mimetype.startsWith('audio/')) {
          await sendAudio(client, targetJid, payloadToSend, options);
        } else {
          await client.sendMessage(targetJid, payloadToSend, options);
        }
      } catch (error) {
        const index = pendingOutgoingMedia.indexOf(pendingMedia);
        if (index >= 0) pendingOutgoingMedia.splice(index, 1);
        throw error;
      }

      return {
        phoneNumber: cleanId,
        body: file || fileUrl || fileBase64 ? `[Arquivo] ${messageToSend}` : messageToSend,
        fromMe: true,
      };
    });
  };
}

module.exports = { createMessageSender };
