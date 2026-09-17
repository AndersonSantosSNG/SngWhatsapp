const Message = require('../../models/Message');
const { isWithinMessageWindow } = require('./messageUtils');

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const REVOKE_WINDOW_MS = 60 * 60 * 60 * 1000;

function createMessageEditor({ getClient, isReady, getIo }) {
  async function editMessage(messageId, content) {
    const client = getClient();
    if (!isReady() || !client) {
      throw new Error(
        'O servico de WhatsApp nao esta pronto. Tente novamente em alguns instantes.',
      );
    }
    const body = String(content || '').trim();
    if (!body) throw new Error('A mensagem editada nao pode ficar vazia.');
    if (body.length > 4096) throw new Error('A mensagem editada e muito longa.');

    const savedMessage = await Message.findById(messageId);
    if (!savedMessage) throw new Error('Mensagem nao encontrada.');
    if (savedMessage.sender !== 'agent' || savedMessage.isInternalEvent) {
      throw new Error('Somente mensagens enviadas pelo atendimento podem ser editadas.');
    }
    if (!isWithinMessageWindow(savedMessage, EDIT_WINDOW_MS)) {
      throw new Error('O prazo de 15 minutos para editar esta mensagem expirou.');
    }
    if (!savedMessage.whatsappMessageId) {
      throw new Error(
        'Esta mensagem nao possui um identificador do WhatsApp e nao pode ser editada.',
      );
    }

    const whatsappMessage = await client.getMessageById(savedMessage.whatsappMessageId);
    if (!whatsappMessage) throw new Error('A mensagem nao foi encontrada no WhatsApp.');
    let editedMessage = await whatsappMessage.edit(body);
    const remoteId = String(
      whatsappMessage.id?.remote?._serialized ||
        whatsappMessage.id?.remote?.$1 ||
        whatsappMessage.id?.remote ||
        whatsappMessage.to ||
        '',
    );
    if (!editedMessage && remoteId.endsWith('@lid')) {
      editedMessage = await client.pupPage.evaluate(
        async ({ whatsappMessageId, body: nextBody }) => {
          const collection = window.require('WAWebCollections').Msg;
          const message =
            collection.get(whatsappMessageId) ||
            (await collection.getMessagesById([whatsappMessageId]))?.messages?.[0];
          if (!message?.id?.fromMe) return null;
          const result = await window.WWebJS.editMessage(message, nextBody, {});
          return result?.serialize?.() || null;
        },
        { whatsappMessageId: savedMessage.whatsappMessageId, body },
      );
    }
    if (!editedMessage) {
      throw new Error(
        'O WhatsApp nao permite mais editar esta mensagem. A janela de edicao pode ter expirado.',
      );
    }
    savedMessage.body = body;
    savedMessage.editedAt = new Date();
    await savedMessage.save();
    const data = {
      messageId: savedMessage._id.toString(),
      ticketId: savedMessage.ticketId.toString(),
      body: savedMessage.body,
      editedAt: savedMessage.editedAt,
    };
    getIo()?.emit('message_edit', data);
    return data;
  }

  async function revokeMessage(messageId) {
    const client = getClient();
    if (!isReady() || !client) {
      throw new Error(
        'O servico de WhatsApp nao esta pronto. Tente novamente em alguns instantes.',
      );
    }
    const savedMessage = await Message.findById(messageId);
    if (!savedMessage) throw new Error('Mensagem nao encontrada.');
    if (savedMessage.sender !== 'agent' || savedMessage.isInternalEvent) {
      throw new Error('Somente mensagens enviadas pelo atendimento podem ser apagadas.');
    }
    if (!isWithinMessageWindow(savedMessage, REVOKE_WINDOW_MS)) {
      throw new Error('O prazo de 2 dias e 12 horas para apagar esta mensagem para todos expirou.');
    }
    if (savedMessage.deletedAt) throw new Error('Esta mensagem ja foi apagada.');
    if (!savedMessage.whatsappMessageId) {
      throw new Error(
        'Esta mensagem nao possui um identificador do WhatsApp e nao pode ser apagada.',
      );
    }
    const whatsappMessage = await client.getMessageById(savedMessage.whatsappMessageId);
    if (!whatsappMessage?.fromMe) {
      throw new Error('A mensagem nao foi encontrada como enviada por esta conta.');
    }
    const canRevoke = await client.pupPage.evaluate(async (whatsappMessageId) => {
      const collection = window.require('WAWebCollections').Msg;
      const message =
        collection.get(whatsappMessageId) ||
        (await collection.getMessagesById([whatsappMessageId]))?.messages?.[0];
      if (!message?.id?.fromMe) return false;
      const capability = window.require('WAWebMsgActionCapability');
      return Boolean(
        capability.canSenderRevokeMsg(message) || capability.canAdminRevokeMsg(message),
      );
    }, savedMessage.whatsappMessageId);
    if (!canRevoke) throw new Error('O WhatsApp nao permite mais apagar esta mensagem para todos.');
    await whatsappMessage.delete(true, false);
    savedMessage.deletedAt = new Date();
    await savedMessage.save();
    const data = {
      messageId: savedMessage._id.toString(),
      ticketId: savedMessage.ticketId.toString(),
      deletedAt: savedMessage.deletedAt,
    };
    getIo()?.emit('message_revoke', data);
    return data;
  }

  return { editMessage, revokeMessage };
}

module.exports = { createMessageEditor };
