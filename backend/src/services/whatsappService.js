require('./whatsappCompatibility').applyCompatibility();
const { displayMessageText, hydrateStoredMentions } = require('./messageContent');
const {
  dedupeCallEvents,
  getCallEventDetails,
  getCallSignature,
  getStoredHistoryMessageId,
  getWhatsAppMessageId,
  isCallLogMessage,
  mergeMessageAck,
} = require('./whatsapp/messageUtils');
const { createMediaService } = require('./whatsapp/mediaService');
const { createChatEventService } = require('./whatsapp/chatEventService');
const { createMessageSender } = require('./whatsapp/messageSender');
const { createContactService } = require('./whatsapp/contactService');
const { createGroupService } = require('./whatsapp/groupService');
const { createMessageEditor } = require('./whatsapp/messageEditor');
const { createContactMetadataService } = require('./whatsapp/contactMetadataService');
const { createHistorySyncService } = require('./whatsapp/historySyncService');
const { createWhatsAppEvents } = require('./whatsapp/whatsappEvents');

const Chat = require('../models/Chat');
const Message = require('../models/Message');

let runtime = null;

const {
  downloadMessageMediaFallback,
  getProfilePicUrl,
  getProfilePicture,
  pendingOutgoingMedia,
  persistMedia,
  saveMessageMedia,
  takePendingOutgoingMedia,
} = createMediaService({
  getClient: () => runtime?.getClient(),
  isClientReady: () => runtime?.isReady() === true,
});

const sendMessage = createMessageSender({
  getClient: () => runtime?.getClient(),
  isReady: () => runtime?.isReady() === true,
  pendingOutgoingMedia,
});

const { getAllChats, getContactPresence } = createContactService({
  getClient: () => runtime?.getClient(),
  isReady: () => runtime?.isReady() === true,
});

const { getGroupMembers, getChatMetadata } = createGroupService({
  getClient: () => runtime?.getClient(),
  isReady: () => runtime?.isReady() === true,
  getProfilePicUrl,
  getChatDisplayName,
});

const { editMessage, revokeMessage } = createMessageEditor({
  getClient: () => runtime?.getClient(),
  isReady: () => runtime?.isReady() === true,
  getIo: () => runtime?.getIo(),
});

const getContactMetadata = createContactMetadataService({
  getClient: () => runtime?.getClient(),
  isReady: () => runtime?.isReady() === true,
  getProfilePicUrl,
});

function getChatDisplayName(chat, fallback = '') {
  return (
    chat?.groupMetadata?.subject ||
    chat?.name ||
    chat?.formattedTitle ||
    chat?.contactName ||
    chat?.contact?.name ||
    chat?.contact?.verifiedName ||
    chat?.contact?.pushname ||
    chat?.notifyName ||
    fallback
  );
}

function shouldRefreshChatName(currentName, phoneNumber) {
  const name = String(currentName || '').trim();
  if (!name) return true;
  const normalizedName = name.replace(/\D/g, '');
  const normalizedPhone = String(phoneNumber || '').replace(/\D/g, '');
  return Boolean(normalizedPhone && normalizedName === normalizedPhone);
}

async function getQuotedContext(msg) {
  const embeddedQuoted = msg?._data?.quotedMsg || msg?.quotedMsg;
  if (!msg?.hasQuotedMsg && !embeddedQuoted) return {};
  try {
    let quoted = null;
    if (typeof msg.getQuotedMessage === 'function') {
      try {
        quoted = await msg.getQuotedMessage();
      } catch (err) {}
    }
    quoted = quoted || embeddedQuoted;
    if (!quoted) return {};
    const quotedWhatsappMessageId = getWhatsAppMessageId(quoted);
    const savedQuoted = quotedWhatsappMessageId
      ? await Message.findOne({ whatsappMessageId: quotedWhatsappMessageId })
      : null;
    const quotedFromMe = quoted.fromMe ?? quoted.id?.fromMe ?? false;
    const quotedBody =
      quoted.body || quoted.caption || (quoted.hasMedia ? '[Mídia/Arquivo]' : 'Mensagem');
    let quotedSenderName = quotedFromMe
      ? 'Você'
      : quoted.notifyName ||
        quoted._data?.notifyName ||
        quoted._data?.senderObj?.pushname ||
        'Contato';
    if (!quotedFromMe && typeof quoted.getContact === 'function') {
      try {
        const quotedContact = await quoted.getContact();
        quotedSenderName =
          quotedContact?.name ||
          quotedContact?.verifiedName ||
          quotedContact?.pushname ||
          quotedSenderName;
      } catch (err) {}
    }
    return {
      quotedMessageId: savedQuoted?._id?.toString() || '',
      quotedWhatsappMessageId,
      quotedBody,
      quotedSenderName,
    };
  } catch (err) {
    return {};
  }
}

const { syncRecentMessages } = createHistorySyncService({
  getClient: () => runtime?.getClient(),
  getIo: () => runtime?.getIo(),
  downloadMessageMediaFallback,
  persistMedia,
  getContactMetadata,
  getChatDisplayName,
  shouldRefreshChatName,
});

const { recordChatEvent, recordGlpiTicketEvent } = createChatEventService({
  getIo: () => runtime?.getIo(),
});

runtime = createWhatsAppEvents({
  syncRecentMessages,
  getContactMetadata,
  getQuotedContext,
  getProfilePicUrl,
  getChatDisplayName,
  saveMessageMedia,
  takePendingOutgoingMedia,
  pendingOutgoingMedia,
  recordChatEvent,
});

const { initWhatsApp, destroyClient, getStatus } = runtime;

module.exports = {
  getGroupMembers,
  resolveStoredMentions: (messages) =>
    hydrateStoredMentions(messages, runtime.isReady() ? runtime.getClient() : null),
  dedupeCallEvents,
  initWhatsApp,
  sendMessage,
  editMessage,
  revokeMessage,
  getStatus,
  destroyClient,
  getAllChats,
  syncRecentMessages,
  getContactPresence,
  getContactMetadata,
  recordChatEvent,
  recordGlpiTicketEvent,
  getProfilePicture,
  getChatMetadata,
};
