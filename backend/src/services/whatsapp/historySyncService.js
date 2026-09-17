const Chat = require('../../models/Chat');
const Message = require('../../models/Message');
const { displayMessageText } = require('../messageContent');
const {
  getCallEventDetails,
  getCallSignature,
  getStoredHistoryMessageId,
  getWhatsAppMessageId,
  isCallLogMessage,
} = require('./messageUtils');

const historySyncDays = Math.max(1, Number.parseInt(process.env.HISTORY_SYNC_DAYS || '30', 10));
const historySyncLimit = Math.max(1, Number.parseInt(process.env.HISTORY_SYNC_LIMIT || '1000', 10));
const historySyncMedia = process.env.HISTORY_SYNC_MEDIA !== 'false';

function createHistorySyncService({
  getClient,
  getIo,
  downloadMessageMediaFallback,
  persistMedia,
  getContactMetadata,
  getChatDisplayName,
  shouldRefreshChatName,
}) {
  let historySyncPromise = null;
  let client = null;
  const getIoInstance = getIo;
  async function getChatsForHistory() {
    return client.pupPage.evaluate(() => {
      let toPn = null;
      try {
        toPn = window.require('WAWebLidMigrationUtils').toPn;
      } catch (err) {}

      return window
        .require('WAWebCollections')
        .Chat.getModelsArray()
        .map((chat) => {
          try {
            const serialized = chat.id?._serialized || chat.id?.$1 || '';
            let phoneNumber = chat.id?.user || '';
            if (serialized.endsWith('@lid') && toPn) {
              try {
                phoneNumber = toPn(chat.id)?.user || phoneNumber;
              } catch (err) {}
            }
            return {
              id: { _serialized: serialized, user: chat.id?.user || '' },
              phoneNumber,
              name:
                chat.groupMetadata?.subject ||
                chat.formattedTitle ||
                chat.name ||
                chat.contactName ||
                chat.contact?.name ||
                chat.contact?.verifiedName ||
                chat.contact?.pushname ||
                chat.notifyName ||
                '',
              formattedTitle: chat.formattedTitle || '',
              isGroup: Boolean(chat.isGroup || serialized.endsWith('@g.us')),
            };
          } catch (err) {
            return null;
          }
        })
        .filter(Boolean);
    });
  }

  async function fetchMessagesForHistory(chatId, cutoff) {
    return client.pupPage.evaluate(
      async ({ id, cutoffSeconds, limit }) => {
        const serializeWid = (value) =>
          typeof value === 'string' ? value : value?._serialized || value?.$1 || '';
        const chats = window.require('WAWebCollections').Chat.getModelsArray();
        const chat = chats.find((item) => (item.id?._serialized || item.id?.$1) === id);
        if (!chat?.msgs) return [];

        const validMessage = (message) =>
          (message.type === 'call_log' || !message.isNotification) &&
          Number(message.t) >= cutoffSeconds;
        let messages = chat.msgs.getModelsArray();
        let previousOldest = 0;

        while (messages.length < limit) {
          const sorted = [...messages].sort((a, b) => Number(a.t) - Number(b.t));
          const oldest = Number(sorted[0]?.t || 0);
          if (!oldest || oldest <= cutoffSeconds || oldest === previousOldest) break;
          previousOldest = oldest;

          let loaded;
          try {
            loaded = await window.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat });
          } catch (err) {
            break;
          }
          if (!loaded?.length) break;
          messages = chat.msgs.getModelsArray();
        }

        return messages
          .filter(validMessage)
          .sort((a, b) => Number(a.t) - Number(b.t))
          .slice(-limit)
          .map((message) => ({
            id: {
              _serialized: serializeWid(message.id),
              id: message.id?.id || '',
              remote: serializeWid(message.id?.remote) || id,
              fromMe: Boolean(message.id?.fromMe),
            },
            fromMe: Boolean(message.id?.fromMe),
            author: serializeWid(message.author),
            body: ['image', 'video', 'audio', 'ptt', 'document', 'sticker'].includes(message.type)
              ? message.caption || ''
              : message.body || '',
            mentionedIds: (message.mentionedJidList || []).map(serializeWid),
            hasMedia: Boolean(
              message.mediaData ||
                message.type === 'image' ||
                message.type === 'video' ||
                message.type === 'audio' ||
                message.type === 'document' ||
                message.type === 'ptt' ||
                message.type === 'sticker',
            ),
            type: message.type || '',
            isVideoCall: Boolean(message.isVideoCall || message.isVideo),
            callOutcome: message.callOutcome || message.callStatus || message.subtype || '',
            callDuration: Number(message.callDuration || message.duration || 0),
            mediaKey: message.mediaKey || message.mediaData?.mediaKey || '',
            timestamp: Number(message.t),
            ack: Number(message.ack),
            _data: {
              author: serializeWid(message.author),
              caption: message.caption || '',
              notifyName: message.notifyName || message.senderObj?.pushname || '',
              directPath: message.directPath || message.mediaData?.directPath || '',
              encFilehash: message.encFilehash || message.mediaData?.encFilehash || '',
              filehash: message.filehash || message.mediaData?.filehash || '',
              mediaKey: message.mediaKey || message.mediaData?.mediaKey || '',
              mediaKeyTimestamp: message.mediaKeyTimestamp || message.mediaData?.mediaKeyTimestamp,
              type: message.type || '',
              isVideoCall: Boolean(message.isVideoCall || message.isVideo),
              callOutcome: message.callOutcome || message.callStatus || message.subtype || '',
              callDuration: Number(message.callDuration || message.duration || 0),
              mimetype: message.mimetype || message.mediaData?.mimetype || '',
              filename: message.filename || message.mediaData?.filename || '',
              size: message.size || message.mediaData?.size,
            },
          }));
      },
      { id: chatId, cutoffSeconds: Math.floor(cutoff / 1000), limit: historySyncLimit },
    );
  }

  async function saveHistoricalMessageMedia(msg) {
    if (!historySyncMedia || !msg.hasMedia) return null;

    try {
      const media = await Promise.race([
        downloadMessageMediaFallback(msg),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout ao baixar midia historica')), 30000),
        ),
      ]);
      return media?.data ? persistMedia(media) : null;
    } catch (err) {
      console.warn(
        `[HISTORICO] Midia ${getWhatsAppMessageId(msg)} indisponivel: ${err.message || err}`,
      );
      return null;
    }
  }

  async function syncRecentMessages() {
    client = getClient();
    if (!client) throw new Error('O servico de WhatsApp nao esta pronto.');
    if (historySyncPromise) return historySyncPromise;

    historySyncPromise = (async () => {
      const cutoff = Date.now() - historySyncDays * 24 * 60 * 60 * 1000;
      const chats = await getChatsForHistory();
      let imported = 0;
      let importedCalls = 0;
      let downloadedMedia = 0;
      const participantNames = new Map();

      console.log(
        `[HISTORICO] Sincronizando ${historySyncDays} dias em ${chats.length} conversas...`,
      );

      for (const chat of chats) {
        const chatId = chat.id?._serialized || '';
        if (!chatId || chatId === 'status@broadcast' || chatId.includes('@broadcast')) continue;

        try {
          const isGroup = Boolean(chat.isGroup || chatId.includes('@g.us'));
          const identifier = isGroup
            ? chatId
            : (chat.phoneNumber || chat.id?.user || chatId.replace(/@.+$/, '')).replace(/\D/g, '');
          if (
            !identifier ||
            (!isGroup && getChatDisplayName(chat, '').trim().toLowerCase() === 'whatsapp business')
          )
            continue;

          const recent = await fetchMessagesForHistory(chatId, cutoff);
          if (!recent.length) continue;

          let storedChat = await Chat.findOne({
            $or: [{ phoneNumber: identifier }, { whatsappId: chatId }],
          });
          let displayName = getChatDisplayName(chat, identifier);
          if (
            !isGroup &&
            (!displayName || /^\+?\d+$/.test(String(displayName).replace(/[\s()-]/g, '')))
          ) {
            try {
              const contactMetadata = await getContactMetadata(identifier);
              if (
                contactMetadata?.name &&
                !/^\+?\d+$/.test(String(contactMetadata.name).replace(/[\s()-]/g, ''))
              ) {
                displayName = contactMetadata.name;
              }
            } catch (err) {}
          }
          const latest = recent[recent.length - 1];
          const latestBody = isCallLogMessage(latest)
            ? getCallEventDetails({ ...latest._data, ...latest, isFinal: true }).body
            : latest.body || (latest.hasMedia ? '[Mídia/Arquivo]' : '');
          const latestDate = new Date(Number(latest.timestamp) * 1000);

          if (!storedChat) {
            storedChat = await Chat.create({
              phoneNumber: identifier,
              whatsappId: chatId,
              contactName: displayName,
              isGroup,
              status: 'pending',
              lastMessage: latestBody,
              lastMessageAt: latestDate,
              updatedAt: latestDate,
            });
          } else {
            let changed = false;
            if (!storedChat.lastMessageAt || latestDate > new Date(storedChat.lastMessageAt)) {
              storedChat.lastMessage = latestBody;
              storedChat.lastMessageAt = latestDate;
              storedChat.updatedAt = latestDate;
              changed = true;
            }
            if (storedChat.whatsappId !== chatId) {
              storedChat.whatsappId = storedChat.whatsappId || chatId;
              changed = true;
            }
            if (
              displayName &&
              shouldRefreshChatName(storedChat.contactName, identifier) &&
              !/^\d+$/.test(displayName.replace(/\D/g, ''))
            ) {
              storedChat.contactName = displayName;
              changed = true;
            }
            if (changed) await storedChat.save();
          }

          const ids = recent.map(getStoredHistoryMessageId).filter(Boolean);
          const existing = await Message.find({ whatsappMessageId: { $in: ids } })
            .select('_id whatsappMessageId hasMedia')
            .lean();
          const existingById = new Map(existing.map((item) => [item.whatsappMessageId, item]));
          const legacyMessages = await Message.find({
            ticketId: storedChat._id,
            whatsappMessageId: '',
            timestamp: { $gte: new Date(cutoff) },
          })
            .select('_id sender body timestamp')
            .lean();
          const storedCalls = await Message.find({
            ticketId: storedChat._id,
            isInternalEvent: true,
            internalAction: { $in: ['call_received', 'call_made', 'call_missed', 'call_rejected'] },
            timestamp: { $gte: new Date(cutoff) },
          })
            .select('body timestamp')
            .lean();
          const seenCallSignatures = new Set(
            storedCalls.map((item) => getCallSignature(storedChat._id, item.body, item.timestamp)),
          );
          const documents = [];
          const legacyUpdates = [];

          for (const msg of recent) {
            const whatsappMessageId = getStoredHistoryMessageId(msg);
            if (!whatsappMessageId) continue;

            const storedMessage = existingById.get(whatsappMessageId);
            if (storedMessage) {
              if (isCallLogMessage(msg)) continue;
              const correctedBody = await displayMessageText(msg, client);
              if (correctedBody && storedMessage.body !== correctedBody)
                await Message.updateOne(
                  { _id: storedMessage._id },
                  { $set: { body: correctedBody } },
                );
              if (msg.hasMedia && !storedMessage.hasMedia) {
                const storedMedia = await saveHistoricalMessageMedia(msg);
                if (storedMedia) {
                  await Message.updateOne({ _id: storedMessage._id }, { $set: storedMedia });
                  downloadedMedia += 1;
                }
              }
              continue;
            }

            const callEvent = isCallLogMessage(msg)
              ? getCallEventDetails({ ...msg._data, ...msg, isFinal: true })
              : null;
            const sender = msg.fromMe ? 'agent' : 'client';
            const body = callEvent?.body || (await displayMessageText(msg, client));
            const timestamp = new Date(Number(msg.timestamp) * 1000);
            if (callEvent) {
              const callSignature = getCallSignature(storedChat._id, body, timestamp);
              if (seenCallSignatures.has(callSignature)) continue;
              seenCallSignatures.add(callSignature);
            }
            const mediaInfo = callEvent ? null : await saveHistoricalMessageMedia(msg);
            if (mediaInfo) downloadedMedia += 1;
            const legacyIndex = legacyMessages.findIndex(
              (item) =>
                item.sender === sender &&
                item.body === body &&
                Math.abs(new Date(item.timestamp).getTime() - timestamp.getTime()) <= 10000,
            );
            if (legacyIndex >= 0) {
              const [legacy] = legacyMessages.splice(legacyIndex, 1);
              legacyUpdates.push({
                updateOne: {
                  filter: { _id: legacy._id },
                  update: { $set: { whatsappMessageId, ...(mediaInfo || {}) } },
                },
              });
              continue;
            }

            let groupSenderId = '';
            let groupSenderName = '';
            if (isGroup && !msg.fromMe) {
              groupSenderId = msg.author || msg._data?.author || '';
              if (participantNames.has(groupSenderId)) {
                groupSenderName = participantNames.get(groupSenderId);
              } else {
                try {
                  const participant = await client.getContactById(groupSenderId);
                  groupSenderName =
                    participant?.name || participant?.verifiedName || participant?.pushname || '';
                } catch (err) {}
                groupSenderName =
                  groupSenderName ||
                  msg._data?.notifyName ||
                  groupSenderId.replace(/@.+$/, '') ||
                  'Participante';
                participantNames.set(groupSenderId, groupSenderName);
              }
            }

            documents.push({
              ticketId: storedChat._id,
              phoneNumber: identifier,
              whatsappMessageId,
              sender,
              groupSenderId,
              groupSenderName,
              body,
              ...(callEvent
                ? { isInternalEvent: true, internalAction: callEvent.internalAction }
                : {}),
              ack: Number.isInteger(msg.ack) ? msg.ack : 0,
              timestamp,
              ...(mediaInfo || {}),
            });
          }

          if (legacyUpdates.length) await Message.bulkWrite(legacyUpdates);
          if (documents.length) {
            await Message.insertMany(documents, { ordered: false });
            imported += documents.length;
            importedCalls += documents.filter((document) =>
              document.internalAction?.startsWith('call_'),
            ).length;
          }
        } catch (err) {
          console.warn(`[HISTORICO] Falha ao sincronizar ${chatId}: ${err.message || err}`);
        }
      }

      console.log(
        `[HISTORICO] Sincronizacao concluida: ${imported} registros (${importedCalls} chamadas) e ${downloadedMedia} midias importadas.`,
      );
      if (getIoInstance())
        getIoInstance().emit('history_sync_complete', {
          imported,
          importedCalls,
          downloadedMedia,
          limitPerChat: historySyncLimit,
        });
      return { imported, importedCalls, downloadedMedia, limitPerChat: historySyncLimit };
    })().finally(() => {
      historySyncPromise = null;
    });

    return historySyncPromise;
  }

  return { syncRecentMessages };
}

module.exports = { createHistorySyncService };
