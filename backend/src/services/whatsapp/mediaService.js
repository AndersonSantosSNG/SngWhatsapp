const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { getWhatsAppMessageId } = require('./messageUtils');

const mediaDirectory = path.join(__dirname, '..', '..', '..', '..', 'storage', 'media');

function createMediaService({ getClient, isClientReady }) {
  const pendingOutgoingMedia = [];

  function getMediaExtension(media) {
    const originalExtension = path.extname(media.filename || '').replace(/[^.a-zA-Z0-9]/g, '');
    if (originalExtension) return originalExtension.toLowerCase();

    const extensions = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'video/mp4': '.mp4',
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'application/pdf': '.pdf',
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
      mediaFileName: media.filename || storedName,
    };
  }

  async function takePendingOutgoingMedia(targetChatId) {
    const now = Date.now();
    let index = pendingOutgoingMedia.findIndex((item) => item.targetJid === targetChatId);
    if (index < 0) index = pendingOutgoingMedia.findIndex((item) => now - item.createdAt < 60000);
    if (index < 0) return null;

    const [pending] = pendingOutgoingMedia.splice(index, 1);
    return persistMedia(pending.media);
  }

  async function downloadMessageMediaFallback(msg) {
    const client = getClient();
    if (!client) return null;

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
      size: raw.size,
    };

    return client.pupPage.evaluate(
      async ({ id, fallbackMedia }) => {
        let model = null;
        try {
          model = window.require('WAWebCollections').Msg.get(id);
        } catch (err) {}
        if (!model) {
          try {
            model = (await window.require('WAWebCollections').Msg.getMessagesById([id]))
              ?.messages?.[0];
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
          addAnnotations() {
            return this;
          },
          addPoint() {
            return this;
          },
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
            downloadQpl: mockQpl,
          });
        return {
          data: await window.WWebJS.arrayBufferToBase64Async(decryptedMedia),
          mimetype: source.mimetype || fallbackMedia.mimetype,
          filename: source.filename || fallbackMedia.filename,
          filesize: source.size || fallbackMedia.size,
        };
      },
      { id: messageId, fallbackMedia: mediaData },
    );
  }

  async function saveMessageMedia(msg) {
    if (
      !msg.hasMedia &&
      !['image', 'video', 'audio', 'ptt', 'document', 'sticker'].includes(msg.type)
    )
      return null;

    try {
      if (msg.id && !msg.id._serialized) msg.id._serialized = getWhatsAppMessageId(msg);
      const media = await Promise.race([
        (async () => {
          try {
            const standardMedia = await msg.downloadMedia();
            if (standardMedia?.data) return standardMedia;
          } catch (err) {}
          return downloadMessageMediaFallback(msg);
        })(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout ao baixar midia')), 30000),
        ),
      ]);
      return media?.data ? persistMedia(media) : null;
    } catch (err) {
      console.error(`[MIDIA] Nao foi possivel baixar a mensagem: ${err.message || err}`);
      return null;
    }
  }

  async function getProfilePicUrl(contactId) {
    const client = getClient();
    if (!client || !contactId) return '';
    try {
      const profilePic = await client.pupPage.evaluate(async (id) => {
        try {
          const wid = window.require('WAWebWidFactory').createWid(id);
          const result = await window.require('WAWebFindChatAction').findOrCreateLatestChat(wid);
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
        contentType: response.headers.get('content-type') || 'image/jpeg',
      };
    } catch (err) {
      return null;
    }
  }

  async function getProfilePicture(identifier, isGroup = false, cachedUrl = '') {
    if (!isClientReady() || !getClient()) return null;
    const cachedPicture = await downloadProfilePicture(cachedUrl);
    if (cachedPicture) return cachedPicture;
    const contactId = isGroup
      ? identifier
      : identifier?.includes('@')
        ? identifier
        : `${identifier.replace(/\D/g, '')}@c.us`;
    return downloadProfilePicture(await getProfilePicUrl(contactId));
  }

  return {
    downloadMessageMediaFallback,
    getProfilePicUrl,
    getProfilePicture,
    pendingOutgoingMedia,
    persistMedia,
    saveMessageMedia,
    takePendingOutgoingMedia,
  };
}

module.exports = { createMediaService };
