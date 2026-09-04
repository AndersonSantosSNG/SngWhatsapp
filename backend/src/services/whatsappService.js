const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const qrcodeTerminal = require('qrcode-terminal');
const config = require('../config/whatsapp');
const { addToQueue } = require('./queueService');

const Ticket = require('../models/Ticket');
const Message = require('../models/Message');
const Agent = require('../models/Agent');

let client = null;
let ioInstance = null;
let isClientReady = false;
let currentQrCode = null;
const recentMessages = new Map();
const pendingMessageAcks = new Map();
const mediaDirectory = path.join(__dirname, '..', '..', '..', 'storage', 'media');
const pendingOutgoingMedia = [];
const historySyncDays = Math.max(1, Number.parseInt(process.env.HISTORY_SYNC_DAYS || '30', 10));
const historySyncLimit = Math.max(1, Number.parseInt(process.env.HISTORY_SYNC_LIMIT || '1000', 10));
const historySyncMedia = process.env.HISTORY_SYNC_MEDIA !== 'false';
let historySyncPromise = null;

function getMediaExtension(media) {
    const originalExtension = path.extname(media.filename || '').replace(/[^.a-zA-Z0-9]/g, '');
    if (originalExtension) return originalExtension.toLowerCase();

    const extensions = {
        'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
        'video/mp4': '.mp4', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'application/pdf': '.pdf'
    };
    return extensions[media.mimetype] || '';
}

async function persistMedia(media) {
    if (!media?.data) return null;

    await fs.mkdir(mediaDirectory, { recursive: true });
    const storedName = `${randomUUID()}${getMediaExtension(media)}`;
    await fs.writeFile(path.join(mediaDirectory, storedName), Buffer.from(media.data, 'base64'));

    return {
        hasMedia: true,
        mediaPath: storedName,
        mediaMimeType: media.mimetype || 'application/octet-stream',
        mediaFileName: media.filename || storedName
    };
}

async function takePendingOutgoingMedia(targetChatId) {
    const now = Date.now();
    let index = pendingOutgoingMedia.findIndex(item => item.targetJid === targetChatId);

    if (index < 0) {
        index = pendingOutgoingMedia.findIndex(item => now - item.createdAt < 60000);
    }
    if (index < 0) return null;

    const [pending] = pendingOutgoingMedia.splice(index, 1);
    return persistMedia(pending.media);
}

async function downloadMessageMediaFallback(msg) {
    const raw = msg._data || {};
    const messageId = getWhatsAppMessageId(msg);
    const mediaData = {
        directPath: raw.directPath,
        encFilehash: raw.encFilehash,
        filehash: raw.filehash,
        mediaKey: raw.mediaKey || msg.mediaKey,
        mediaKeyTimestamp: raw.mediaKeyTimestamp,
        type: raw.type || msg.type,
        mimetype: raw.mimetype,
        filename: raw.filename,
        size: raw.size
    };

    return client.pupPage.evaluate(async ({ id, fallbackMedia }) => {
        let model = null;
        try {
            model = window.require('WAWebCollections').Msg.get(id);
        } catch (err) {}

        if (!model) {
            try {
                model = (
                    await window.require('WAWebCollections').Msg.getMessagesById([id])
                )?.messages?.[0];
            } catch (err) {}
        }

        if (model?.mediaData?.mediaStage !== 'RESOLVED') {
            try {
                await model.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1 });
            } catch (err) {}
        }

        const source = model || fallbackMedia;
        if (!source?.directPath || !source?.mediaKey) return null;

        const mockQpl = {
            addAnnotations() { return this; },
            addPoint() { return this; }
        };
        const decryptedMedia = await window
            .require('WAWebDownloadManager')
            .downloadManager.downloadAndMaybeDecrypt({
                directPath: source.directPath,
                encFilehash: source.encFilehash,
                filehash: source.filehash,
                mediaKey: source.mediaKey,
                mediaKeyTimestamp: source.mediaKeyTimestamp,
                type: source.type,
                signal: new AbortController().signal,
                downloadQpl: mockQpl
            });

        return {
            data: await window.WWebJS.arrayBufferToBase64Async(decryptedMedia),
            mimetype: source.mimetype || fallbackMedia.mimetype,
            filename: source.filename || fallbackMedia.filename,
            filesize: source.size || fallbackMedia.size
        };
    }, { id: messageId, fallbackMedia: mediaData });
}

async function saveMessageMedia(msg) {
    if (!msg.hasMedia) return null;

    try {
        if (msg.id && !msg.id._serialized) {
            msg.id._serialized = getWhatsAppMessageId(msg);
        }

        const media = await Promise.race([
            (async () => {
                try {
                    const standardMedia = await msg.downloadMedia();
                    if (standardMedia?.data) return standardMedia;
                } catch (err) {}

                return downloadMessageMediaFallback(msg);
            })(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ao baixar midia')), 30000))
        ]);
        if (!media?.data) return null;

        return persistMedia(media);
    } catch (err) {
        console.error(`[MIDIA] Nao foi possivel baixar a mensagem: ${err.message || err}`);
        return null;
    }
}

function getWhatsAppMessageId(msg) {
    const id = msg?.id;
    if (!id) return '';

    if (id._serialized) return id._serialized;
    if (id.$1) return id.$1;

    const messageId = id.id || '';
    const remote = id.remote || msg.to || msg.from || '';
    return messageId && remote ? `${id.fromMe ? 'true' : 'false'}_${remote}_${messageId}` : messageId;
}

function mergeMessageAck(previousAck, nextAck) {
    if (nextAck === -1) return -1;
    if (previousAck === -1) return nextAck;
    return Math.max(previousAck ?? 0, nextAck ?? 0);
}

async function getProfilePicUrl(contactId) {
    if (!client || !contactId) return '';

    try {
        const profilePic = await client.pupPage.evaluate(async (id) => {
            try {
                const wid = window.require('WAWebWidFactory').createWid(id);
                const result = await window
                    .require('WAWebFindChatAction')
                    .findOrCreateLatestChat(wid);
                const chat = result?.chat || result;

                if (!chat) return undefined;

                return await window
                    .require('WAWebContactProfilePicThumbBridge')
                    .requestProfilePicFromServer(chat);
            } catch (err) {
                if (err?.name === 'ServerStatusCodeError') return undefined;
                throw err;
            }
        }, contactId);

        return profilePic?.eurl || '';
    } catch (err) {
        console.warn(`[FOTO] Foto indisponivel para ${contactId}: ${err.message || err}`);
        return '';
    }
}

async function downloadProfilePicture(url) {
    if (!url) return null;

    try {
        const response = await fetch(url);
        if (!response.ok) return null;

        return {
            buffer: Buffer.from(await response.arrayBuffer()),
            contentType: response.headers.get('content-type') || 'image/jpeg'
        };
    } catch (err) {
        return null;
    }
}

async function getProfilePicture(identifier, isGroup = false, cachedUrl = '') {
    if (!isClientReady || !client) return null;

    const cachedPicture = await downloadProfilePicture(cachedUrl);
    if (cachedPicture) return cachedPicture;

    const contactId = isGroup
        ? identifier
        : identifier?.includes('@')
            ? identifier
            : `${identifier.replace(/\D/g, '')}@c.us`;
    const url = await getProfilePicUrl(contactId);

    return downloadProfilePicture(url);
}

function getChatDisplayName(chat, fallback = '') {
    return chat?.name
        || chat?.formattedTitle
        || chat?.groupMetadata?.subject
        || fallback;
}

async function getQuotedContext(msg) {
    if (!msg?.hasQuotedMsg) return {};
    try {
        const quoted = await msg.getQuotedMessage();
        const quotedWhatsappMessageId = getWhatsAppMessageId(quoted);
        const savedQuoted = quotedWhatsappMessageId
            ? await Message.findOne({ whatsappMessageId: quotedWhatsappMessageId })
            : null;
        const quotedBody = quoted.body || (quoted.hasMedia ? '[Mídia/Arquivo]' : 'Mensagem');
        let quotedSenderName = quoted.fromMe ? 'Você' : (quoted._data?.notifyName || quoted._data?.senderObj?.pushname || 'Contato');
        if (!quoted.fromMe) {
            try {
                const quotedContact = await quoted.getContact();
                quotedSenderName = quotedContact?.name || quotedContact?.verifiedName || quotedContact?.pushname || quotedSenderName;
            } catch (err) {}
        }
        return {
            quotedMessageId: savedQuoted?._id?.toString() || '',
            quotedWhatsappMessageId,
            quotedBody,
            quotedSenderName
        };
    } catch (err) {
        return {};
    }
}

async function getChatsForHistory() {
    return client.pupPage.evaluate(() => {
        let toPn = null;
        try { toPn = window.require('WAWebLidMigrationUtils').toPn; } catch (err) {}

        return window.require('WAWebCollections').Chat.getModelsArray().map(chat => {
            try {
                const serialized = chat.id?._serialized || chat.id?.$1 || '';
                let phoneNumber = chat.id?.user || '';
                if (serialized.endsWith('@lid') && toPn) {
                    try { phoneNumber = toPn(chat.id)?.user || phoneNumber; } catch (err) {}
                }
                return {
                    id: { _serialized: serialized, user: chat.id?.user || '' },
                    phoneNumber,
                    name: chat.formattedTitle || chat.name || chat.groupMetadata?.subject || '',
                    formattedTitle: chat.formattedTitle || '',
                    isGroup: Boolean(chat.isGroup || serialized.endsWith('@g.us'))
                };
            } catch (err) {
                return null;
            }
        }).filter(Boolean);
    });
}

async function fetchMessagesForHistory(chatId, cutoff) {
    return client.pupPage.evaluate(async ({ id, cutoffSeconds, limit }) => {
        const serializeWid = value => typeof value === 'string' ? value : (value?._serialized || value?.$1 || '');
        const chats = window.require('WAWebCollections').Chat.getModelsArray();
        const chat = chats.find(item => (item.id?._serialized || item.id?.$1) === id);
        if (!chat?.msgs) return [];

        const validMessage = message => !message.isNotification && Number(message.t) >= cutoffSeconds;
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
            .map(message => ({
                id: {
                    _serialized: serializeWid(message.id),
                    id: message.id?.id || '',
                    remote: serializeWid(message.id?.remote) || id,
                    fromMe: Boolean(message.id?.fromMe)
                },
                fromMe: Boolean(message.id?.fromMe),
                author: serializeWid(message.author),
                body: message.body || message.caption || '',
                hasMedia: Boolean(message.mediaData || message.type === 'image' || message.type === 'video' || message.type === 'audio' || message.type === 'document' || message.type === 'ptt' || message.type === 'sticker'),
                type: message.type || '',
                mediaKey: message.mediaKey || message.mediaData?.mediaKey || '',
                timestamp: Number(message.t),
                ack: Number(message.ack),
                _data: {
                    author: serializeWid(message.author),
                    notifyName: message.notifyName || message.senderObj?.pushname || '',
                    directPath: message.directPath || message.mediaData?.directPath || '',
                    encFilehash: message.encFilehash || message.mediaData?.encFilehash || '',
                    filehash: message.filehash || message.mediaData?.filehash || '',
                    mediaKey: message.mediaKey || message.mediaData?.mediaKey || '',
                    mediaKeyTimestamp: message.mediaKeyTimestamp || message.mediaData?.mediaKeyTimestamp,
                    type: message.type || '',
                    mimetype: message.mimetype || message.mediaData?.mimetype || '',
                    filename: message.filename || message.mediaData?.filename || '',
                    size: message.size || message.mediaData?.size
                }
            }));
    }, { id: chatId, cutoffSeconds: Math.floor(cutoff / 1000), limit: historySyncLimit });
}

async function saveHistoricalMessageMedia(msg) {
    if (!historySyncMedia || !msg.hasMedia) return null;

    try {
        const media = await Promise.race([
            downloadMessageMediaFallback(msg),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ao baixar midia historica')), 30000))
        ]);
        return media?.data ? persistMedia(media) : null;
    } catch (err) {
        console.warn(`[HISTORICO] Midia ${getWhatsAppMessageId(msg)} indisponivel: ${err.message || err}`);
        return null;
    }
}

async function syncRecentMessages() {
    if (historySyncPromise) return historySyncPromise;

    historySyncPromise = (async () => {
        const cutoff = Date.now() - historySyncDays * 24 * 60 * 60 * 1000;
        const chats = await getChatsForHistory();
        let imported = 0;
        let downloadedMedia = 0;
        const participantNames = new Map();

        console.log(`[HISTORICO] Sincronizando ${historySyncDays} dias em ${chats.length} conversas...`);

        for (const chat of chats) {
            const chatId = chat.id?._serialized || '';
            if (!chatId || chatId === 'status@broadcast' || chatId.includes('@broadcast')) continue;

            try {
                const isGroup = Boolean(chat.isGroup || chatId.includes('@g.us'));
                const identifier = isGroup ? chatId : (chat.phoneNumber || chat.id?.user || chatId.replace(/@.+$/, '')).replace(/\D/g, '');
                if (!identifier) continue;

                const recent = await fetchMessagesForHistory(chatId, cutoff);
                if (!recent.length) continue;

                let ticket = await Ticket.findOne({ $or: [{ phoneNumber: identifier }, { whatsappId: chatId }] });
                const latest = recent[recent.length - 1];
                const latestBody = latest.body || (latest.hasMedia ? '[Mídia/Arquivo]' : '');
                const latestDate = new Date(Number(latest.timestamp) * 1000);

                if (!ticket) {
                    ticket = await Ticket.create({
                        phoneNumber: identifier,
                        whatsappId: chatId,
                        contactName: getChatDisplayName(chat, identifier),
                        isGroup,
                        status: 'pending',
                        lastMessage: latestBody,
                        lastMessageAt: latestDate,
                        updatedAt: latestDate
                    });
                } else if (!ticket.lastMessageAt || latestDate > new Date(ticket.lastMessageAt)) {
                    ticket.lastMessage = latestBody;
                    ticket.lastMessageAt = latestDate;
                    ticket.updatedAt = latestDate;
                    ticket.whatsappId = ticket.whatsappId || chatId;
                    await ticket.save();
                }

                const ids = recent.map(getWhatsAppMessageId).filter(Boolean);
                const existing = await Message.find({ whatsappMessageId: { $in: ids } }).select('_id whatsappMessageId hasMedia').lean();
                const existingById = new Map(existing.map(item => [item.whatsappMessageId, item]));
                const legacyMessages = await Message.find({
                    ticketId: ticket._id,
                    whatsappMessageId: '',
                    timestamp: { $gte: new Date(cutoff) }
                }).select('_id sender body timestamp').lean();
                const documents = [];
                const legacyUpdates = [];

                for (const msg of recent) {
                    const whatsappMessageId = getWhatsAppMessageId(msg);
                    if (!whatsappMessageId) continue;

                    const storedMessage = existingById.get(whatsappMessageId);
                    if (storedMessage) {
                        if (msg.hasMedia && !storedMessage.hasMedia) {
                            const storedMedia = await saveHistoricalMessageMedia(msg);
                            if (storedMedia) {
                                await Message.updateOne({ _id: storedMessage._id }, { $set: storedMedia });
                                downloadedMedia += 1;
                            }
                        }
                        continue;
                    }

                    const sender = msg.fromMe ? 'agent' : 'client';
                    const body = msg.body || (msg.hasMedia ? '[Mídia/Arquivo]' : '');
                    const timestamp = new Date(Number(msg.timestamp) * 1000);
                    const mediaInfo = await saveHistoricalMessageMedia(msg);
                    if (mediaInfo) downloadedMedia += 1;
                    const legacyIndex = legacyMessages.findIndex(item =>
                        item.sender === sender
                        && item.body === body
                        && Math.abs(new Date(item.timestamp).getTime() - timestamp.getTime()) <= 10000
                    );
                    if (legacyIndex >= 0) {
                        const [legacy] = legacyMessages.splice(legacyIndex, 1);
                        legacyUpdates.push({
                            updateOne: {
                                filter: { _id: legacy._id },
                                update: { $set: { whatsappMessageId, ...(mediaInfo || {}) } }
                            }
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
                                groupSenderName = participant?.name || participant?.verifiedName || participant?.pushname || '';
                            } catch (err) {}
                            groupSenderName = groupSenderName || msg._data?.notifyName || groupSenderId.replace(/@.+$/, '') || 'Participante';
                            participantNames.set(groupSenderId, groupSenderName);
                        }
                    }

                    documents.push({
                        ticketId: ticket._id,
                        phoneNumber: identifier,
                        whatsappMessageId,
                        sender,
                        groupSenderId,
                        groupSenderName,
                        body,
                        ack: Number.isInteger(msg.ack) ? msg.ack : 0,
                        timestamp,
                        ...(mediaInfo || {})
                    });
                }

                if (legacyUpdates.length) await Message.bulkWrite(legacyUpdates);
                if (documents.length) {
                    await Message.insertMany(documents, { ordered: false });
                    imported += documents.length;
                }
            } catch (err) {
                console.warn(`[HISTORICO] Falha ao sincronizar ${chatId}: ${err.message || err}`);
            }
        }

        console.log(`[HISTORICO] Sincronizacao concluida: ${imported} mensagens e ${downloadedMedia} midias importadas.`);
        if (ioInstance) ioInstance.emit('history_sync_complete', { imported, downloadedMedia });
        return { imported, downloadedMedia };
    })().finally(() => { historySyncPromise = null; });

    return historySyncPromise;
}

async function getChatMetadata(chatId) {
    if (!isClientReady || !client || !chatId) return null;

    try {
        const internalChat = await client.pupPage.evaluate(async (id) => {
            try {
                const wid = window.require('WAWebWidFactory').createWid(id);

                if (id.includes('@g.us')) {
                    try {
                        await window
                            .require('WAWebGroupQueryJob')
                            .queryAndUpdateGroupMetadataById({ id });
                    } catch (err) {}
                }

                let chat = window.require('WAWebCollections').Chat.get(wid);
                if (!chat) {
                    const result = await window
                        .require('WAWebFindChatAction')
                        .findOrCreateLatestChat(wid);
                    chat = result?.chat || result;
                }

                if (!chat) return null;

                return {
                    id: chat.id?._serialized || chat.id?.$1 || id,
                    name: chat.formattedTitle || chat.name || chat.groupMetadata?.subject || '',
                    isGroup: Boolean(chat.isGroup || id.includes('@g.us'))
                };
            } catch (err) {
                return null;
            }
        }, chatId);

        let chat = null;
        if (!internalChat?.name) {
            try {
                chat = await client.getChatById(chatId);
            } catch (err) {}
        }

        if (!internalChat && !chat) return null;

        return {
            id: internalChat?.id || chat?.id?._serialized || chatId,
            name: internalChat?.name || getChatDisplayName(chat),
            isGroup: Boolean(internalChat?.isGroup || chat?.isGroup || chatId.includes('@g.us')),
            profilePicUrl: await getProfilePicUrl(internalChat?.id || chat?.id?._serialized || chatId)
        };
    } catch (err) {
        console.warn(`[CHAT] Nao foi possivel carregar os metadados de ${chatId}: ${err.message || err}`);
        return null;
    }
}

function initWhatsApp(io) {
    ioInstance = io;

    client = new Client({
        authStrategy: new LocalAuth({ dataPath: config.authPath }),
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version-check/main/html/2.3000.1018939023-alpha.html',
        },
        puppeteer: {
            ...config.puppeteer,
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
            timeout: 120000 
        }
    });

    client.on('qr', (qr) => {
        isClientReady = false;
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
        console.log('🔑 Autenticado com sucesso no WhatsApp Web!');
    });

    client.on('ready', () => {
        isClientReady = true;
        currentQrCode = null;
        console.log('🚀 Cliente WhatsApp Pronto para Uso!');
        // O evento ready pode ocorrer antes de o cache de chats terminar de
        // carregar. Dar esse tempo evita o erro minificado "r" do WhatsApp.
        setTimeout(() => {
            if (!isClientReady) return;
            syncRecentMessages().catch(err => console.error('[HISTORICO] Falha na sincronizacao:', err?.stack || err?.message || err));
        }, 15000);
    });

    client.on('auth_failure', (msg) => {
        console.error('❌ Falha na autenticação:', msg);
        isClientReady = false;
    });

    client.on('message', async (msg) => {
        if (msg.isStatus || msg.from === 'status@broadcast' || msg.to === 'status@broadcast') return;

        try {
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
                    groupSenderName = participant?.name || participant?.verifiedName || participant?.pushname || '';
                    groupSenderId = participant?.id?._serialized || groupSenderId;
                } catch (err) {}

                if (!groupSenderName) {
                    groupSenderName = msg._data?.notifyName || groupSenderId.replace(/@.+$/, '') || 'Participante';
                }
            } else {
                let cleanPhone = '';
                try {
                    const contact = await msg.getContact();
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
                        })
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

            const bodyContent = msg.body || (msg.hasMedia ? '[Mídia/Arquivo]' : '');
            const messageDate = new Date((Number(msg.timestamp) || Date.now() / 1000) * 1000);
            const mediaInfo = await saveMessageMedia(msg);
            const quotedInfo = await getQuotedContext(msg);

            let ticket = await Ticket.findOne({ phoneNumber: identifier });
            if (!ticket) {
                ticket = await Ticket.create({
                    phoneNumber: identifier,
                    whatsappId,
                    contactName: senderName,
                    profilePicUrl: profilePicUrl || '',
                    isGroup: isGroupChat,
                    status: 'pending',
                    lastMessage: bodyContent,
                    lastMessageAt: messageDate
                });
            } else {
                ticket.lastMessage = bodyContent;
                ticket.lastMessageAt = messageDate;
                ticket.isTemporary = false;
                ticket.whatsappId = whatsappId || ticket.whatsappId;
                if (senderName) ticket.contactName = senderName;
                if (profilePicUrl) ticket.profilePicUrl = profilePicUrl;
                if (ticket.status === 'closed') ticket.status = 'pending';
                ticket.updatedAt = Date.now();
                await ticket.save();
            }

            const savedDbMessage = await Message.create({
                ticketId: ticket._id,
                phoneNumber: identifier,
                whatsappMessageId: getWhatsAppMessageId(msg),
                sender: 'client',
                groupSenderId,
                groupSenderName,
                body: bodyContent,
                ...quotedInfo,
                ...(mediaInfo || {})
            });

            const msgData = {
                id: savedDbMessage._id.toString(),
                ticketId: ticket._id.toString(),
                from: msg.from,
                senderName: isGroupChat ? groupSenderName : (senderName || identifier),
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
                fromMe: false
            };

            recentMessages.set(msg.from, msg);
            setTimeout(() => recentMessages.delete(msg.from), 10 * 60 * 1000);

            if (ioInstance) {
                ioInstance.emit('new_message', {
                    ticket,
                    message: msgData
                });
            }
        } catch (err) {
            console.error('Erro no processamento da mensagem recebida:', err.message);
        }
    });

    client.on('message_create', async (msg) => {
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

            const bodyContent = msg.body || (msg.hasMedia ? '[Mídia/Arquivo]' : '');
            const messageDate = new Date((Number(msg.timestamp) || Date.now() / 1000) * 1000);
            const mediaInfo = await takePendingOutgoingMedia(targetChatId) || await saveMessageMedia(msg);
            const quotedInfo = await getQuotedContext(msg);

            let ticket = await Ticket.findOne({ phoneNumber: identifier });
            if (!ticket) {
                ticket = await Ticket.create({
                    phoneNumber: identifier,
                    whatsappId,
                    contactName: chatName,
                    profilePicUrl: profilePicUrl || '',
                    isGroup: isGroupChat,
                    status: 'open',
                    lastMessage: bodyContent,
                    lastMessageAt: messageDate
                });
            } else {
                ticket.lastMessage = bodyContent;
                ticket.lastMessageAt = messageDate;
                ticket.isTemporary = false;
                ticket.whatsappId = whatsappId || ticket.whatsappId;
                if (chatName && chatName !== identifier) {
                    ticket.contactName = chatName;
                }
                if (profilePicUrl) {
                    ticket.profilePicUrl = profilePicUrl;
                }
                ticket.updatedAt = Date.now();
                await ticket.save();
            }

            // Evita criar duplicado exato no DB caso a mensagem já venha de message_create idêntica recente
            const existingMessage = await Message.findOne({
                ticketId: ticket._id,
                body: bodyContent,
                sender: 'agent',
                createdAt: { $gte: new Date(Date.now() - 5000) }
            });

            let savedDbMessage = existingMessage;
            const whatsappMessageId = getWhatsAppMessageId(msg);
            const pendingAck = pendingMessageAcks.get(whatsappMessageId);
            const currentAck = Number.isInteger(pendingAck)
                ? pendingAck
                : (Number.isInteger(msg.ack) ? msg.ack : 0);

            if (!savedDbMessage) {
                savedDbMessage = await Message.create({
                    ticketId: ticket._id,
                    phoneNumber: identifier,
                    whatsappMessageId,
                    sender: 'agent',
                    body: bodyContent,
                    ack: currentAck,
                    ...quotedInfo,
                    ...(mediaInfo || {})
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
                ticketId: ticket._id.toString(),
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
                timestamp: new Date(savedDbMessage.createdAt || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                fromMe: true
            };

            if (ioInstance) {
                ioInstance.emit('new_message', {
                    ticket,
                    message: msgData
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
                    ack: savedMessage.ack
                });
            } else {
                console.log(`[ACK] Confirmacao ${ack} aguardando gravacao da mensagem`);
            }
        } catch (err) {
            console.error('Erro ao atualizar confirmacao da mensagem:', err.message);
        }
    });

    client.on('remote_session_saved', () => {
        console.log('📌 Sessão remota vinculada e salva.');
    });

    client.on('change_state', state => {
        console.log('🔄 Estado do cliente mudou para:', state);
    });

    client.on('disconnected', async (reason) => {
        isClientReady = false;
        currentQrCode = null;
        console.warn(`⚠️ Cliente desconectado. Motivo: ${reason}`);

        try {
            await client.destroy();
        } catch (err) {
            console.error('Erro ao destruir client:', err);
        }

        setTimeout(() => initWhatsApp(ioInstance), 5000);
    });

    client.initialize().catch(err => console.error('❌ Falha ao inicializar o client:', err));
}

async function sendMessage({ number, message, file, fileUrl, fileBase64, mimeType, fileName, agentId, replyToMessageId }) {
    if (!isClientReady || !client) {
        throw new Error('O serviço de WhatsApp não está pronto. Tente novamente em alguns instantes.');
    }

    let messageToSend = message || '';
    if (agentId) {
        const agent = await Agent.findOne({ _id: agentId, active: true });
        if (!agent) throw new Error('Agente nao encontrado ou inativo.');
        messageToSend = `${agent.name}: ${messageToSend}`;
    }

    const cleanId = number.replace(/\D/g, '');
    let targetJid;

    if (number.includes('@g.us')) {
        targetJid = number;
    } else {
        const resolvedId = await client.getNumberId(cleanId);
        if (resolvedId && resolvedId._serialized) {
            targetJid = resolvedId._serialized;
        } else {
            targetJid = `${cleanId}@c.us`;
        }
    }

    return addToQueue(async () => {
        let options = {};
        if (replyToMessageId) {
            const quotedMessage = await Message.findById(replyToMessageId);
            if (quotedMessage?.whatsappMessageId) options.quotedMessageId = quotedMessage.whatsappMessageId;
        }
        let payloadToSend = messageToSend;

        if (file) {
            payloadToSend = new MessageMedia(file.mimetype, file.buffer.toString('base64'), file.originalname);
            if (messageToSend) options.caption = messageToSend;
        } else if (fileUrl) {
            payloadToSend = await MessageMedia.fromUrl(fileUrl, { unsafeMime: true });
            if (messageToSend) options.caption = messageToSend;
        } else if (fileBase64) {
            payloadToSend = new MessageMedia(mimeType || 'application/octet-stream', fileBase64, fileName || 'arquivo');
            if (messageToSend) options.caption = messageToSend;
        }

        let pendingMedia = null;
        if (payloadToSend instanceof MessageMedia) {
            pendingMedia = {
                targetJid,
                createdAt: Date.now(),
                media: {
                    data: payloadToSend.data,
                    mimetype: payloadToSend.mimetype,
                    filename: payloadToSend.filename
                }
            };
            pendingOutgoingMedia.push(pendingMedia);
            setTimeout(() => {
                const index = pendingOutgoingMedia.indexOf(pendingMedia);
                if (index >= 0) pendingOutgoingMedia.splice(index, 1);
            }, 60000);
        }

        // Apenas envia a mensagem pelo WhatsApp. 
        // O evento 'message_create' vai capturar o envio e cuidar do banco de dados e do Socket.io sem duplicar.
        try {
            await client.sendMessage(targetJid, payloadToSend, options);
        } catch (err) {
            const index = pendingOutgoingMedia.indexOf(pendingMedia);
            if (index >= 0) pendingOutgoingMedia.splice(index, 1);
            throw err;
        }

        const textContent = (file || fileUrl || fileBase64) ? `[Arquivo] ${messageToSend}` : messageToSend;

        return {
            phoneNumber: cleanId,
            body: textContent,
            fromMe: true
        };
    });
}

async function getAllChats() {
    if (!isClientReady || !client) {
        throw new Error('O serviço de WhatsApp não está pronto.');
    }

    const chats = await client.getChats();
    
    return chats.map(chat => ({
        id: chat.id._serialized,
        name: chat.name || chat.formattedTitle || 'Desconhecido',
        isGroup: chat.isGroup,
        unreadCount: chat.unreadCount,
        lastMessage: chat.lastMessage ? chat.lastMessage.body : null
    }));
}

async function getContactPresence(contactId, phoneNumber = '') {
    if (!isClientReady || !client || !contactId) return { isOnline: false };

    const cleanPhone = String(phoneNumber || contactId).replace(/\D/g, '');
    const ids = [
        String(contactId),
        cleanPhone ? `${cleanPhone}@c.us` : ''
    ].filter(Boolean);
    try {
        const resolvedId = cleanPhone ? await client.getNumberId(cleanPhone) : null;
        if (resolvedId?._serialized) ids.unshift(resolvedId._serialized);
    } catch (err) {}

    try {
        const isOnline = await client.pupPage.evaluate(async candidateIds => {
            const widFactory = window.require('WAWebWidFactory');
            const collections = window.require('WAWebCollections');
            const presenceAction = window.require('WAWebPresenceChatAction');
            const candidates = [];

            for (const id of [...new Set(candidateIds)]) {
                try {
                    const wid = widFactory.createWid(id);
                    candidates.push(wid);
                    try {
                        const alternate = window.require('WAWebApiContact').getAlternateUserWid(wid);
                        if (alternate) candidates.push(alternate);
                    } catch {}
                } catch {}
            }

            for (const wid of candidates) {
                try { await presenceAction.subscribePresence?.(wid); } catch {}
            }
            await new Promise(resolve => setTimeout(resolve, 1500));

            return candidates.some(wid => {
                const serialized = wid?._serialized || String(wid);
                const chat = collections.Chat.get(wid) || collections.Chat.get(serialized);
                let storedPresence = null;
                try { storedPresence = collections.Presence?.get?.(wid) || collections.Presence?.get?.(serialized); } catch {}
                const presence = chat?.presence || storedPresence;
                const chatState = presence?.chatstates?.get?.(wid)
                    || presence?.chatstates?.get?.(serialized)
                    || presence?.chatstate;
                const state = chatState?.type || chatState?._state || chatState?.state;
                return presence?.isOnline === true || state === 'available' || state === 'online';
            });
        }, ids);

        return { isOnline: isOnline === true };
    } catch {
        return { isOnline: false };
    }
}

async function getContactMetadata(number) {
    if (!isClientReady || !client) {
        throw new Error('O servico de WhatsApp nao esta pronto.');
    }

    const cleanNumber = String(number || '').replace(/\D/g, '');
    const resolvedId = await client.getNumberId(cleanNumber);
    if (!resolvedId?._serialized) {
        throw new Error('Este numero nao foi encontrado no WhatsApp.');
    }

    const whatsappId = resolvedId._serialized;
    let contact = null;
    let chat = null;
    try { contact = await client.getContactById(whatsappId); } catch (err) {}
    try { chat = await client.getChatById(whatsappId); } catch (err) {}
    let loadedName = '';
    try {
        loadedName = await client.pupPage.evaluate(async ({ ids, fallbackNumber }) => {
            for (const id of ids) {
                try {
                    const wid = window.require('WAWebWidFactory').createWid(id);
                    const collections = window.require('WAWebCollections');
                    let internalChat = collections.Chat.get(wid) || collections.Chat.get(id);
                    if (!internalChat) {
                        internalChat = await window.require('WAWebFindChatAction').findOrCreateLatestChat(wid);
                    }

                    const internalContact = internalChat?.contact || await collections.Contact.find(wid);
                    const getters = window.require('WAWebContactGetters');
                    const candidates = [
                        getters.getName(internalContact),
                        getters.getVerifiedName(internalContact),
                        getters.getPushname(internalContact),
                        internalChat?.formattedTitle,
                        internalChat?.name
                    ];
                    const name = candidates.find(value => value && String(value).trim() && String(value).replace(/\D/g, '') !== fallbackNumber);
                    if (name) return String(name).trim();
                } catch (err) {}
            }
            return '';
        }, { ids: [whatsappId, `${cleanNumber}@c.us`], fallbackNumber: cleanNumber });
    } catch (err) {}
    // O ID resolvido pode ser um LID interno do WhatsApp e nunca deve substituir
    // o numero que o agente informou no painel.
    const phoneNumber = cleanNumber;
    const nameCandidates = [
        contact?.name,
        contact?.verifiedName,
        contact?.pushname,
        loadedName,
        chat?.name,
        chat?.formattedTitle,
        chat?.contact?.name,
        chat?.contact?.verifiedName,
        chat?.contact?.pushname
    ];
    const resolvedNameText = nameCandidates
        .map(value => String(value || '').trim())
        .find(value => value && !/^[+\d\s()-]+$/.test(value));
    const contactName = resolvedNameText || phoneNumber;
    let profilePicUrl = '';
    try { profilePicUrl = await getProfilePicUrl(whatsappId); } catch (err) {}

    const makeSerializable = value => {
        try { return JSON.parse(JSON.stringify(value)); } catch (err) { return null; }
    };
    const rawPayload = {
        requestedNumber: cleanNumber,
        resolvedId: makeSerializable(resolvedId),
        contact: makeSerializable(contact?._data || contact),
        chat: makeSerializable(chat?._data || chat),
        loadedName
    };

    console.dir({ event: 'NEW_CONVERSATION_WHATSAPP_PAYLOAD', payload: rawPayload }, { depth: null });
    return { phoneNumber, whatsappId, name: contactName, contactName, profilePicUrl, rawPayload };
}

function destroyClient() {
    if (client) return client.destroy();
    return Promise.resolve();
}

function getStatus() {
    return { isClientReady, currentQrCode };
}

async function recordTicketEvent(ticket, agent, action) {
    const actionLabels = {
        claimed: 'assumiu o atendimento',
        unclaimed: 'devolveu o atendimento',
        closed: 'encerrou o atendimento'
    };
    if (!ticket || !agent || !actionLabels[action]) throw new Error('Evento interno invalido.');

    const savedEvent = await Message.create({
        ticketId: ticket._id,
        phoneNumber: ticket.phoneNumber,
        sender: 'agent',
        isInternalEvent: true,
        internalAction: action,
        internalActorName: agent.name,
        body: `${agent.name} ${actionLabels[action]}`,
        timestamp: new Date()
    });

    const eventData = {
        id: savedEvent._id.toString(),
        ticketId: ticket._id.toString(),
        sender: 'agent',
        body: savedEvent.body,
        isInternalEvent: true,
        internalAction: action,
        internalActorName: agent.name,
        timestamp: savedEvent.timestamp,
        fromMe: true
    };

    if (ioInstance) ioInstance.emit('ticket_event', eventData);
    return eventData;
}

module.exports = {
    initWhatsApp,
    sendMessage,
    getStatus,
    destroyClient,
    getAllChats,
    syncRecentMessages,
    getContactPresence,
    getContactMetadata,
    recordTicketEvent,
    getProfilePicture,
    getChatMetadata
};
