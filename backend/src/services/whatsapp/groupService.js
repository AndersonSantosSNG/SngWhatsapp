function createGroupService({ getClient, isReady, getProfilePicUrl, getChatDisplayName }) {
  async function getGroupMembers(chatId) {
    const client = getClient();
    if (!isReady() || !client) throw new Error('O serviço de WhatsApp não está pronto.');
    if (!chatId?.endsWith('@g.us')) throw new Error('Esta conversa não é um grupo.');
    return client.pupPage.evaluate(async (id) => {
      const serialize = (value) =>
        typeof value === 'string' ? value : value?._serialized || value?.$1 || '';
      const wid = window.require('WAWebWidFactory').createWid(id);
      await window.require('WAWebGroupQueryJob').queryAndUpdateGroupMetadataById({ id });
      const collections = window.require('WAWebCollections');
      const chat = collections.Chat.get(wid);
      const metadata = chat?.groupMetadata || collections.GroupMetadata?.get(wid);
      const participants = metadata?.participants?.getModelsArray?.();
      if (!participants) throw new Error('Não foi possível carregar os membros do grupo.');
      return participants.map((participant) => {
        const memberId = serialize(participant.id);
        let alternate;
        try {
          alternate = window.require('WAWebApiContact').getAlternateUserWid(participant.id);
        } catch {}
        const contact =
          collections.Contact.get(participant.id) || collections.Contact.get(alternate);
        const phoneId =
          [memberId, serialize(alternate)].find((value) => value.endsWith('@c.us')) || '';
        return {
          id: memberId,
          name: contact?.name || contact?.verifiedName || contact?.pushname || '',
          phoneNumber: phoneId.split('@')[0],
          isAdmin: Boolean(participant.isAdmin || participant.isSuperAdmin),
        };
      });
    }, chatId);
  }

  async function getChatMetadata(chatId) {
    const client = getClient();
    if (!isReady() || !client || !chatId) return null;
    try {
      const internalChat = await client.pupPage.evaluate(async (id) => {
        try {
          const wid = window.require('WAWebWidFactory').createWid(id);
          if (id.includes('@g.us')) {
            try {
              await window.require('WAWebGroupQueryJob').queryAndUpdateGroupMetadataById({ id });
            } catch {}
          }
          let chat = window.require('WAWebCollections').Chat.get(wid);
          if (!chat) {
            const result = await window.require('WAWebFindChatAction').findOrCreateLatestChat(wid);
            chat = result?.chat || result;
          }
          if (!chat) return null;
          const collections = window.require('WAWebCollections');
          const groupMetadata = chat.groupMetadata || collections.GroupMetadata?.get(wid);
          return {
            id: chat.id?._serialized || chat.id?.$1 || id,
            name: groupMetadata?.subject || chat.formattedTitle || chat.name || '',
            isGroup: Boolean(chat.isGroup || id.includes('@g.us')),
          };
        } catch {
          return null;
        }
      }, chatId);
      let chat = null;
      if (!internalChat?.name) {
        try {
          chat = await client.getChatById(chatId);
        } catch {}
      }
      if (!internalChat && !chat) return null;
      const id = internalChat?.id || chat?.id?._serialized || chatId;
      return {
        id,
        name: internalChat?.name || getChatDisplayName(chat),
        isGroup: Boolean(internalChat?.isGroup || chat?.isGroup || chatId.includes('@g.us')),
        profilePicUrl: await getProfilePicUrl(id),
      };
    } catch (error) {
      console.warn(`[CHAT] Nao foi possivel carregar os metadados de ${chatId}: ${error.message}`);
      return null;
    }
  }

  return { getGroupMembers, getChatMetadata };
}

module.exports = { createGroupService };
