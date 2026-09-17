const qrcodeTerminal = require('qrcode-terminal');
const Chat = require('../../models/Chat');
const Message = require('../../models/Message');
const { createWhatsAppClient } = require('./whatsappClient');
const { displayMessageText } = require('../messageContent');
const {
  getCallEventDetails,
  getCallSignature,
  getWhatsAppMessageId,
  isCallLogMessage,
  mergeMessageAck,
} = require('./messageUtils');

function createWhatsAppEvents({
  syncRecentMessages,
  getContactMetadata,
  getQuotedContext,
  getProfilePicUrl,
  getChatDisplayName,
  saveMessageMedia,
  takePendingOutgoingMedia,
  pendingOutgoingMedia,
  recordChatEvent,
}) {
  let client = null;
  let ioInstance = null;
  let isClientReady = false;
  let currentQrCode = null;
  let connectionStatus = 'STARTING';
  let connectedSince = null;
  let lastMessageAt = null;
  let reconnectCount = 0;
  let callPollTimer = null;
  const recentMessages = new Map();
  const pendingMessageAcks = new Map();
  const recentCallEvents = new Map();
  function initWhatsApp(io) {
    ioInstance = io;

    client = createWhatsAppClient();

    client.on('qr', (qr) => {
      isClientReady = false;
      connectionStatus = 'WAITING_QR';
      currentQrCode = qr;
      qrcodeTerminal.generate(qr, { small: true });
      console.log('📌 QR Code gerado!');
      if (ioInstance) ioInstance.emit('qr_code', { qr });
    });

    console.log('⏳ Iniciando navegador e carregando o WhatsApp Web...');

    client.on('loading_screen', (percent, message) => {
      console.log(`⏳ Carregando: ${percent}% - ${message}`);
    });

    client.on('authenticated', () => {
      connectionStatus = 'AUTHENTICATING';
      console.log('🔑 Autenticado com sucesso no WhatsApp Web!');
    });

    client.on('ready', () => {
      isClientReady = true;
      connectionStatus = 'READY';
      connectedSince = new Date();
      currentQrCode = null;
      console.log('🚀 Cliente WhatsApp Pronto para Uso!');
      setTimeout(async () => {
        try {
          const result = await client.pupPage.evaluate(() => {
            const collection = window.require('WAWebCallCollection');
            const serializeCall = (value) => ({
              id: value.id,
              peerJid: value.peerJid,
              isVideo: value.isVideo,
              isGroup: value.isGroup,
              outgoing: value.outgoing,
              offerTime: value.offerTime,
            });
            let eventCaptureInstalled = false;
            if (
              collection &&
              typeof collection.on === 'function' &&
              !collection.__sngCallEventsInstalled
            ) {
              const forwardCall = (value) => window.onIncomingCall(serializeCall(value));
              collection.on('add', forwardCall);
              collection.on('change', forwardCall);
              collection.__sngCallEventsInstalled = true;
              eventCaptureInstalled = true;
            }
            const mapKey = Object.keys(collection).find((key) => collection[key] instanceof Map);
            const callMap = mapKey ? collection[mapKey] : null;
            if (!callMap) return 'collection-unavailable';
            if (callMap.__sngCallCaptureInstalled)
              return eventCaptureInstalled
                ? 'events-and-map-already-installed'
                : 'already-installed';
            const originalSet = callMap.set.bind(callMap);
            callMap.set = function (key, value) {
              window.onIncomingCall(serializeCall(value));
              return originalSet(key, value);
            };
            callMap.__sngCallCaptureInstalled = true;
            return eventCaptureInstalled ? 'events-and-map-installed' : 'map-installed';
          });
          console.log(`[WHATSAPP] Captura interna de chamadas: ${result}`);
        } catch (err) {
          console.warn(
            `[WHATSAPP] Não foi possível instalar captura interna: ${err.message || err}`,
          );
        }
      }, 3000);
      // O evento ready pode ocorrer antes de o cache de chats terminar de
      // carregar. Dar esse tempo evita o erro minificado "r" do WhatsApp.
      setTimeout(() => {
        if (!isClientReady) return;
        syncRecentMessages().catch((err) =>
          console.error('[HISTORICO] Falha na sincronizacao:', err?.stack || err?.message || err),
        );
      }, 15000);
    });

    client.on('auth_failure', (msg) => {
      console.error('❌ Falha na autenticação:', msg);
      isClientReady = false;
      connectionStatus = 'FAILED';
    });

    const handleIncomingCall = async (call) => {
      const whatsappId = String(call.from || call.peerJid || '');
      console.log(`[WHATSAPP] Chamada recebida de ${whatsappId || 'origem desconhecida'}`);
      if (!whatsappId) return;

      try {
        const callId = call.id ? `${call.isFinal ? 'call-log' : 'call'}:${String(call.id)}` : '';
        if (callId && (await Message.exists({ whatsappMessageId: callId }))) return;
        const fromMe = Boolean(call.fromMe ?? call.outgoing);
        const callDate = new Date(
          (Number(call.timestamp || call.offerTime) || Date.now() / 1000) * 1000,
        );
        const { internalAction, body } = getCallEventDetails(call);
        const callSignature = getCallSignature(whatsappId, body, callDate);
        if (recentCallEvents.has(callSignature)) return;
        recentCallEvents.set(callSignature, Date.now());
        setTimeout(() => recentCallEvents.delete(callSignature), 10 * 60 * 1000);

        const isGroup = Boolean(call.isGroup || whatsappId.endsWith('@g.us'));
        let contactName = isGroup ? 'Grupo' : '';
        let phoneNumber = isGroup ? whatsappId : whatsappId.replace(/\D/g, '');
        let profilePicUrl = '';

        try {
          if (isGroup) {
            const chat = await client.getChatById(whatsappId);
            contactName = getChatDisplayName(chat, contactName);
          } else {
            const contact = await client.getContactById(whatsappId);
            contactName = contact?.name || contact?.verifiedName || contact?.pushname || '';
            phoneNumber =
              contact?.number?.replace(/\D/g, '') ||
              (!String(contact?.id?.user || '').includes('@') ? contact?.id?.user : '') ||
              phoneNumber;
          }
          profilePicUrl = (await getProfilePicUrl(whatsappId)) || '';
        } catch (err) {}

        let chat = await Chat.findOne({ $or: [{ whatsappId }, { phoneNumber }] });
        if (
          chat &&
          (await Message.exists({
            ticketId: chat._id,
            isInternalEvent: true,
            internalAction,
            body,
            timestamp: {
              $gte: new Date(callDate.getTime() - 5000),
              $lte: new Date(callDate.getTime() + 5000),
            },
          }))
        )
          return;
        if (!chat) {
          chat = await Chat.create({
            phoneNumber,
            whatsappId,
            contactName: contactName || phoneNumber,
            profilePicUrl,
            isGroup,
            status: 'pending',
            lastMessage: body,
            lastMessageAt: callDate,
          });
        } else {
          chat.whatsappId = whatsappId || chat.whatsappId;
          chat.lastMessage = body;
          chat.lastMessageAt = callDate;
          chat.isTemporary = false;
          if (contactName) chat.contactName = contactName;
          if (profilePicUrl) chat.profilePicUrl = profilePicUrl;
          if (chat.status === 'closed') chat.status = 'pending';
          chat.updatedAt = Date.now();
          await chat.save();
        }

        const savedCall = await Message.create({
          ticketId: chat._id,
          phoneNumber: chat.phoneNumber,
          whatsappMessageId: callId,
          sender: fromMe ? 'agent' : 'client',
          isInternalEvent: true,
          internalAction,
          body,
          timestamp: callDate,
        });
        const message = {
          id: savedCall._id.toString(),
          ticketId: chat._id.toString(),
          sender: fromMe ? 'agent' : 'client',
          body,
          isInternalEvent: true,
          internalAction,
          timestamp: savedCall.timestamp,
          fromMe,
        };

        if (ioInstance) ioInstance.emit('new_message', { chat, message });
        console.log(`[WHATSAPP] Chamada registrada na conversa ${chat._id}`);
      } catch (err) {
        console.error('Erro ao registrar chamada recebida:', err?.stack || err?.message || err);
      }
    };

    client.on('call', handleIncomingCall);
    client.on('message_create', async (msg) => {
      if (msg.type !== 'call_log' && msg._data?.type !== 'call_log') return;
      if (!msg.fromMe) return;
      await handleIncomingCall({
        id: getWhatsAppMessageId(msg),
        peerJid: msg.fromMe ? msg.to : msg.from,
        fromMe: Boolean(msg.fromMe),
        isVideo: Boolean(msg._data?.isVideoCall || msg._data?.isVideo),
        isGroup: Boolean(msg.from?.endsWith('@g.us') || msg.to?.endsWith('@g.us')),
        timestamp: msg.timestamp,
        outcome: msg._data?.callOutcome || msg._data?.callStatus || msg._data?.subtype,
        duration: msg._data?.callDuration || msg.duration,
        isFinal: true,
      });
    });

    const pollCalls = async () => {
      if (!isClientReady || !client?.pupPage) return;
      try {
        const calls = await client.pupPage.evaluate(() => {
          const collection = window.require('WAWebCallCollection');
          const mapKey = Object.keys(collection).find((key) => collection[key] instanceof Map);
          const callMap = mapKey ? collection[mapKey] : null;
          return callMap
            ? [...callMap.values()].map((call) => ({
                id: call.id,
                peerJid: call.peerJid,
                isVideo: call.isVideo,
                isGroup: call.isGroup,
                outgoing: call.outgoing,
                offerTime: call.offerTime,
              }))
            : [];
        });
        for (const call of calls) {
          const timestamp = Number(call.offerTime || 0) * 1000;
          if (timestamp && Date.now() - timestamp > 10 * 60 * 1000) continue;
          await handleIncomingCall(call);
        }
      } catch (err) {
        console.warn(`[WHATSAPP] Falha ao consultar chamadas: ${err.message || err}`);
      }
    };
    callPollTimer = setInterval(pollCalls, 2000);

    client.on('message', async (msg) => {
      lastMessageAt = new Date();
      if (msg.isStatus || msg.from === 'status@broadcast' || msg.to === 'status@broadcast') return;

      try {
        if (msg.type === 'call_log' || msg._data?.type === 'call_log') {
          await handleIncomingCall({
            id: getWhatsAppMessageId(msg),
            peerJid: msg.fromMe ? msg.to : msg.from,
            fromMe: Boolean(msg.fromMe),
            isVideo: Boolean(msg._data?.isVideoCall || msg._data?.isVideo),
            isGroup: Boolean(msg.from?.endsWith('@g.us') || msg.to?.endsWith('@g.us')),
            timestamp: msg.timestamp,
            outcome: msg._data?.callOutcome || msg._data?.callStatus || msg._data?.subtype,
            duration: msg._data?.callDuration || msg.duration,
            isFinal: true,
          });
          return;
        }

        let senderName = '';
        let identifier = '';
        let profilePicUrl = '';
        let whatsappId = msg.from;
        let isGroupChat = msg.from.includes('@g.us');
        let groupSenderId = '';
        let groupSenderName = '';

        if (isGroupChat) {
          identifier = msg.from;
          groupSenderId = msg.author || msg._data?.author || '';
          try {
            const chat = await msg.getChat();
            senderName = getChatDisplayName(chat, 'Grupo sem nome');
            try {
              profilePicUrl = await getProfilePicUrl(chat.id._serialized);
            } catch (err) {}
          } catch (e) {
            senderName = 'Grupo';
          }

          try {
            const participant = groupSenderId
              ? await client.getContactById(groupSenderId)
              : await msg.getContact();
            groupSenderName =
              participant?.name || participant?.verifiedName || participant?.pushname || '';
            groupSenderId = participant?.id?._serialized || groupSenderId;
          } catch (err) {}

          if (!groupSenderName) {
            groupSenderName =
              msg._data?.notifyName || groupSenderId.replace(/@.+$/, '') || 'Participante';
          }
        } else {
          let cleanPhone = '';
          try {
            const contact = await msg.getContact();
            if (
              [contact.name, contact.verifiedName, contact.pushname].some(
                (name) =>
                  String(name || '')
                    .trim()
                    .toLowerCase() === 'whatsapp business',
              )
            )
              return;
            whatsappId = contact.id?._serialized || msg.from;

            let timerFoto;

            try {
              console.log('[FOTO] Iniciando consulta');

              const resultado = await Promise.race([
                getProfilePicUrl(contact.id._serialized),

                new Promise((_, reject) => {
                  timerFoto = setTimeout(() => {
                    reject(new Error('Consulta não respondeu em 10 segundos'));
                  }, 10000);
                }),
              ]);

              console.log('[FOTO] Consulta concluída:', resultado);

              profilePicUrl = resultado || '';
            } catch (erro) {
              console.error('[FOTO] ERRO:', erro.stack || erro);
            } finally {
              clearTimeout(timerFoto);
            }

            if (contact.id && contact.id.user && !contact.id.user.includes('@')) {
              cleanPhone = contact.id.user;
            } else if (contact.number) {
              cleanPhone = contact.number.replace(/\D/g, '');
            }

            if ((!cleanPhone || cleanPhone.length < 8) && contact.id && contact.id._serialized) {
              const serialized = contact.id._serialized;
              if (!serialized.includes('@lid')) {
                cleanPhone = serialized.replace(/\D/g, '');
              }
            }

            if (!cleanPhone || cleanPhone.length < 8) {
              const chat = await msg.getChat();
              if (chat && chat.id && chat.id.user && !chat.id.user.includes('@')) {
                cleanPhone = chat.id.user;
              } else {
                cleanPhone = msg.from.replace(/\D/g, '');
              }
            }

            senderName = contact.name || contact.verifiedName || contact.pushname || '';
          } catch (e) {
            cleanPhone = msg.from.replace(/\D/g, '');
          }
          identifier = cleanPhone.replace(/\D/g, '');
        }

        if (!profilePicUrl) {
          try {
            const chat = await msg.getChat();
            if (chat) {
              profilePicUrl = await getProfilePicUrl(chat.id._serialized);
            }
          } catch (err) {}
        }

        if (!isGroupChat && senderName?.trim().toLowerCase() === 'whatsapp business') return;
        const bodyContent = await displayMessageText(msg, client);
        const messageDate = new Date((Number(msg.timestamp) || Date.now() / 1000) * 1000);
        const mediaInfo = await saveMessageMedia(msg);
        const quotedInfo = await getQuotedContext(msg);

        let chat = await Chat.findOne({ phoneNumber: identifier });
        if (!chat) {
          chat = await Chat.create({
            phoneNumber: identifier,
            whatsappId,
            contactName: senderName,
            profilePicUrl: profilePicUrl || '',
            isGroup: isGroupChat,
            status: 'pending',
            lastMessage: bodyContent,
            lastMessageAt: messageDate,
          });
        } else {
          chat.lastMessage = bodyContent;
          chat.lastMessageAt = messageDate;
          chat.isTemporary = false;
          chat.whatsappId = whatsappId || chat.whatsappId;
          if (senderName) chat.contactName = senderName;
          if (profilePicUrl) chat.profilePicUrl = profilePicUrl;
          if (chat.status === 'closed') chat.status = 'pending';
          chat.updatedAt = Date.now();
          await chat.save();
        }

        const savedDbMessage = await Message.create({
          ticketId: chat._id,
          phoneNumber: identifier,
          whatsappMessageId: getWhatsAppMessageId(msg),
          sender: 'client',
          groupSenderId,
          groupSenderName,
          body: bodyContent,
          ...quotedInfo,
          ...(mediaInfo || {}),
        });

        const msgData = {
          id: savedDbMessage._id.toString(),
          whatsappMessageId: savedDbMessage.whatsappMessageId,
          ticketId: chat._id.toString(),
          from: msg.from,
          senderName: isGroupChat ? groupSenderName : senderName || identifier,
          groupSenderId,
          groupSenderName,
          phoneNumber: identifier,
          ...quotedInfo,
          profilePicUrl: profilePicUrl || '',
          body: bodyContent,
          hasMedia: Boolean(mediaInfo),
          mediaUrl: mediaInfo ? `/api/messages/${savedDbMessage._id}/media` : null,
          mediaMimeType: mediaInfo?.mediaMimeType || '',
          mediaFileName: mediaInfo?.mediaFileName || '',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          sentAt: savedDbMessage.timestamp,
          fromMe: false,
        };

        recentMessages.set(msg.from, msg);
        setTimeout(() => recentMessages.delete(msg.from), 10 * 60 * 1000);

        if (ioInstance) {
          ioInstance.emit('new_message', {
            chat,
            message: msgData,
          });
        }
      } catch (err) {
        console.error('Erro no processamento da mensagem recebida:', err.message);
      }
    });

    client.on('message_create', async (msg) => {
      if (msg.type === 'call_log' || msg._data?.type === 'call_log') return;
      if (!msg.fromMe || msg.from === 'status@broadcast') return;

      try {
        const targetChatId = msg.to || msg.id.remote;
        const whatsappId = targetChatId;
        const isGroupChat = targetChatId.includes('@g.us');

        let identifier = '';
        let chatName = '';
        let profilePicUrl = '';

        if (isGroupChat) {
          identifier = targetChatId;
          try {
            const chat = await client.getChatById(targetChatId);
            chatName = getChatDisplayName(chat, 'Grupo sem nome');
            profilePicUrl = await getProfilePicUrl(chat.id._serialized);
          } catch (e) {
            chatName = 'Grupo';
          }
        } else {
          let cleanId = targetChatId;
          try {
            const contact = await client.getContactById(targetChatId);
            if (contact) {
              try {
                profilePicUrl = await getProfilePicUrl(contact.id._serialized);
              } catch (err) {}

              if (contact.id && contact.id.user && !contact.id.user.includes('@')) {
                identifier = contact.id.user;
              } else if (contact.number) {
                identifier = contact.number.replace(/\D/g, '');
              }

              chatName = contact.name || contact.verifiedName || contact.pushname || '';
            }
          } catch (e) {}

          if (!identifier || identifier.length < 8) {
            identifier = cleanId.replace(/\D/g, '');
          }

          if (!chatName) {
            chatName = identifier;
          }
        }

        if (!profilePicUrl) {
          try {
            const chat = await client.getChatById(targetChatId);
            if (chat) {
              profilePicUrl = await getProfilePicUrl(chat.id._serialized);
            }
          } catch (err) {}
        }

        if (!identifier) return;

        const bodyContent = await displayMessageText(msg, client);
        const messageDate = new Date((Number(msg.timestamp) || Date.now() / 1000) * 1000);
        const mediaInfo =
          (await takePendingOutgoingMedia(targetChatId)) || (await saveMessageMedia(msg));
        const quotedInfo = await getQuotedContext(msg);

        let chat = await Chat.findOne({ phoneNumber: identifier });
        if (!chat) {
          chat = await Chat.create({
            phoneNumber: identifier,
            whatsappId,
            contactName: chatName,
            profilePicUrl: profilePicUrl || '',
            isGroup: isGroupChat,
            status: 'open',
            lastMessage: bodyContent,
            lastMessageAt: messageDate,
          });
        } else {
          chat.lastMessage = bodyContent;
          chat.lastMessageAt = messageDate;
          chat.isTemporary = false;
          chat.whatsappId = whatsappId || chat.whatsappId;
          if (chatName && chatName !== identifier) {
            chat.contactName = chatName;
          }
          if (profilePicUrl) {
            chat.profilePicUrl = profilePicUrl;
          }
          chat.updatedAt = Date.now();
          await chat.save();
        }

        // Evita criar duplicado exato no DB caso a mensagem já venha de message_create idêntica recente
        const existingMessage = await Message.findOne({
          ticketId: chat._id,
          body: bodyContent,
          sender: 'agent',
          createdAt: { $gte: new Date(Date.now() - 5000) },
        });

        let savedDbMessage = existingMessage;
        const whatsappMessageId = getWhatsAppMessageId(msg);
        const pendingAck = pendingMessageAcks.get(whatsappMessageId);
        const currentAck = Number.isInteger(pendingAck)
          ? pendingAck
          : Number.isInteger(msg.ack)
            ? msg.ack
            : 0;

        if (!savedDbMessage) {
          savedDbMessage = await Message.create({
            ticketId: chat._id,
            phoneNumber: identifier,
            whatsappMessageId,
            sender: 'agent',
            body: bodyContent,
            ack: currentAck,
            ...quotedInfo,
            ...(mediaInfo || {}),
          });
        } else {
          savedDbMessage.whatsappMessageId = whatsappMessageId || savedDbMessage.whatsappMessageId;
          savedDbMessage.ack = mergeMessageAck(savedDbMessage.ack, currentAck);
          Object.assign(savedDbMessage, quotedInfo);
          if (mediaInfo) {
            savedDbMessage.hasMedia = true;
            savedDbMessage.mediaPath = mediaInfo.mediaPath;
            savedDbMessage.mediaMimeType = mediaInfo.mediaMimeType;
            savedDbMessage.mediaFileName = mediaInfo.mediaFileName;
          }
          await savedDbMessage.save();
        }

        pendingMessageAcks.delete(whatsappMessageId);

        const msgData = {
          id: savedDbMessage._id.toString(),
          whatsappMessageId: savedDbMessage.whatsappMessageId,
          ticketId: chat._id.toString(),
          from: targetChatId,
          senderName: 'Você',
          phoneNumber: identifier,
          ...quotedInfo,
          profilePicUrl: profilePicUrl || '',
          body: bodyContent,
          ack: savedDbMessage.ack,
          hasMedia: savedDbMessage.hasMedia,
          mediaUrl: savedDbMessage.hasMedia ? `/api/messages/${savedDbMessage._id}/media` : null,
          mediaMimeType: savedDbMessage.mediaMimeType || '',
          mediaFileName: savedDbMessage.mediaFileName || '',
          timestamp: new Date(savedDbMessage.createdAt || Date.now()).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          sentAt: savedDbMessage.timestamp,
          fromMe: true,
        };

        if (ioInstance) {
          ioInstance.emit('new_message', {
            chat,
            message: msgData,
          });
        }
      } catch (err) {
        console.error('Erro no processamento da mensagem enviada (message_create):', err.message);
      }
    });

    client.on('message_ack', async (msg, ack) => {
      if (!msg.fromMe) return;

      try {
        const whatsappMessageId = getWhatsAppMessageId(msg);
        if (!whatsappMessageId) return;

        const previousAck = pendingMessageAcks.get(whatsappMessageId);
        pendingMessageAcks.set(whatsappMessageId, mergeMessageAck(previousAck, ack));
        setTimeout(() => pendingMessageAcks.delete(whatsappMessageId), 10 * 60 * 1000);

        const savedMessage = await Message.findOne({ whatsappMessageId });
        if (savedMessage) {
          savedMessage.ack = mergeMessageAck(savedMessage.ack, ack);
          await savedMessage.save();
        }

        if (savedMessage && ioInstance) {
          pendingMessageAcks.delete(whatsappMessageId);
          console.log(`[ACK] Mensagem ${savedMessage._id}: ${ack}`);
          ioInstance.emit('message_ack', {
            messageId: savedMessage._id.toString(),
            ticketId: savedMessage.ticketId.toString(),
            ack: savedMessage.ack,
          });
        } else {
          console.log(`[ACK] Confirmacao ${ack} aguardando gravacao da mensagem`);
        }
      } catch (err) {
        console.error('Erro ao atualizar confirmacao da mensagem:', err.message);
      }
    });

    client.on('message_edit', async (msg, newBody) => {
      try {
        const whatsappMessageId = getWhatsAppMessageId(msg);
        if (!whatsappMessageId) return;

        const savedMessage = await Message.findOne({ whatsappMessageId });
        if (!savedMessage) return;

        savedMessage.body = String(newBody ?? msg.body ?? '').trim();
        savedMessage.editedAt = new Date();
        await savedMessage.save();

        if (ioInstance) {
          ioInstance.emit('message_edit', {
            messageId: savedMessage._id.toString(),
            ticketId: savedMessage.ticketId.toString(),
            body: savedMessage.body,
            editedAt: savedMessage.editedAt,
          });
        }
      } catch (err) {
        console.error('Erro ao sincronizar edicao da mensagem:', err.message);
      }
    });

    client.on('message_revoke_everyone', async (msg, revokedMsg) => {
      try {
        const whatsappMessageId =
          getWhatsAppMessageId(revokedMsg) || getWhatsAppMessageId({ id: msg?.protocolMessageKey });
        if (!whatsappMessageId) return;

        const savedMessage = await Message.findOne({ whatsappMessageId });
        if (!savedMessage) return;

        savedMessage.deletedAt = new Date();
        await savedMessage.save();

        if (ioInstance) {
          ioInstance.emit('message_revoke', {
            messageId: savedMessage._id.toString(),
            ticketId: savedMessage.ticketId.toString(),
            deletedAt: savedMessage.deletedAt,
          });
        }
      } catch (err) {
        console.error('Erro ao sincronizar exclusao da mensagem:', err.message);
      }
    });

    client.on('remote_session_saved', () => {
      console.log('📌 Sessão remota vinculada e salva.');
    });

    client.on('change_state', (state) => {
      if (!isClientReady) connectionStatus = state ? 'DEGRADED' : connectionStatus;
      console.log('🔄 Estado do cliente mudou para:', state);
    });

    client.on('disconnected', async (reason) => {
      isClientReady = false;
      connectionStatus = 'RECOVERING';
      connectedSince = null;
      reconnectCount += 1;
      currentQrCode = null;
      console.warn(`⚠️ Cliente desconectado. Motivo: ${reason}`);

      try {
        await client.destroy();
      } catch (err) {
        console.error('Erro ao destruir client:', err);
      }

      setTimeout(() => initWhatsApp(ioInstance), 5000);
    });

    client.initialize().catch((err) => {
      isClientReady = false;
      connectionStatus = 'FAILED';
      console.error('❌ Falha ao inicializar o client:', err);
    });
  }

  function destroyClient() {
    if (callPollTimer) {
      clearInterval(callPollTimer);
      callPollTimer = null;
    }
    if (client) return client.destroy();
    return Promise.resolve();
  }

  function getStatus() {
    return {
      isClientReady,
      currentQrCode,
      status: connectionStatus,
      provider: 'whatsapp-web',
      connectedSince,
      lastMessageAt,
      reconnectCount,
      chromium: client ? 'RUNNING' : 'STOPPED',
    };
  }

  return {
    initWhatsApp,
    destroyClient,
    getStatus,
    getClient: () => client,
    isReady: () => isClientReady,
    getIo: () => ioInstance,
  };
}

module.exports = { createWhatsAppEvents };
