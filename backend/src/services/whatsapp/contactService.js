function createContactService({ getClient, isReady }) {
  async function getAllChats() {
    const client = getClient();
    if (!isReady() || !client) throw new Error('O serviço de WhatsApp não está pronto.');
    const chats = await client.getChats();
    return chats.map((chat) => ({
      id: chat.id._serialized,
      name: chat.name || chat.formattedTitle || 'Desconhecido',
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount,
      lastMessage: chat.lastMessage ? chat.lastMessage.body : null,
    }));
  }

  async function getContactPresence(contactId, phoneNumber = '') {
    const client = getClient();
    if (!isReady() || !client || !contactId) return { isOnline: false };

    const cleanPhone = String(phoneNumber || contactId).replace(/\D/g, '');
    const ids = [String(contactId), cleanPhone ? `${cleanPhone}@c.us` : ''].filter(Boolean);
    try {
      const resolvedId = cleanPhone ? await client.getNumberId(cleanPhone) : null;
      if (resolvedId?._serialized) ids.unshift(resolvedId._serialized);
    } catch {}

    try {
      const isOnline = await client.pupPage.evaluate(async (candidateIds) => {
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
          try {
            await presenceAction.subscribePresence?.(wid);
          } catch {}
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));

        return candidates.some((wid) => {
          const serialized = wid?._serialized || String(wid);
          const chat = collections.Chat.get(wid) || collections.Chat.get(serialized);
          let storedPresence = null;
          try {
            storedPresence =
              collections.Presence?.get?.(wid) || collections.Presence?.get?.(serialized);
          } catch {}
          const presence = chat?.presence || storedPresence;
          const chatState =
            presence?.chatstates?.get?.(wid) ||
            presence?.chatstates?.get?.(serialized) ||
            presence?.chatstate;
          const state = chatState?.type || chatState?._state || chatState?.state;
          return presence?.isOnline === true || state === 'available' || state === 'online';
        });
      }, ids);
      return { isOnline: isOnline === true };
    } catch {
      return { isOnline: false };
    }
  }

  return { getAllChats, getContactPresence };
}

module.exports = { createContactService };
