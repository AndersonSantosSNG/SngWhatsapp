function serializable(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function createContactMetadataService({ getClient, isReady, getProfilePicUrl }) {
  return async function getContactMetadata(number) {
    const client = getClient();
    if (!isReady() || !client) throw new Error('O servico de WhatsApp nao esta pronto.');
    const cleanNumber = String(number || '').replace(/\D/g, '');
    const resolvedId = await client.getNumberId(cleanNumber);
    if (!resolvedId?._serialized) throw new Error('Este numero nao foi encontrado no WhatsApp.');

    const whatsappId = resolvedId._serialized;
    let contact = null;
    let chat = null;
    try {
      contact = await client.getContactById(whatsappId);
    } catch {}
    try {
      chat = await client.getChatById(whatsappId);
    } catch {}

    let loadedName = '';
    try {
      loadedName = await client.pupPage.evaluate(
        async ({ ids, fallbackNumber }) => {
          for (const id of ids) {
            try {
              const wid = window.require('WAWebWidFactory').createWid(id);
              const collections = window.require('WAWebCollections');
              let internalChat = collections.Chat.get(wid) || collections.Chat.get(id);
              if (!internalChat) {
                internalChat = await window
                  .require('WAWebFindChatAction')
                  .findOrCreateLatestChat(wid);
              }
              const internalContact =
                internalChat?.contact || (await collections.Contact.find(wid));
              const getters = window.require('WAWebContactGetters');
              const candidates = [
                getters.getName(internalContact),
                getters.getVerifiedName(internalContact),
                getters.getPushname(internalContact),
                internalChat?.formattedTitle,
                internalChat?.name,
              ];
              const name = candidates.find(
                (value) =>
                  value &&
                  String(value).trim() &&
                  String(value).replace(/\D/g, '') !== fallbackNumber,
              );
              if (name) return String(name).trim();
            } catch {}
          }
          return '';
        },
        { ids: [whatsappId, `${cleanNumber}@c.us`], fallbackNumber: cleanNumber },
      );
    } catch {}

    const candidates = [
      contact?.name,
      contact?.verifiedName,
      contact?.pushname,
      loadedName,
      chat?.name,
      chat?.formattedTitle,
      chat?.contact?.name,
      chat?.contact?.verifiedName,
      chat?.contact?.pushname,
    ];
    const contactName =
      candidates
        .map((value) => String(value || '').trim())
        .find((value) => value && !/^[+\d\s()-]+$/.test(value)) || cleanNumber;
    let profilePicUrl = '';
    let about = '';
    let formattedNumber = '';
    let countryCode = '';
    try {
      profilePicUrl = await getProfilePicUrl(whatsappId);
    } catch {}
    if (contact) {
      try {
        about = (await contact.getAbout()) || '';
      } catch {}
      try {
        formattedNumber = (await contact.getFormattedNumber()) || '';
      } catch {}
      try {
        countryCode = (await contact.getCountryCode()) || '';
      } catch {}
    }
    const businessProfile = contact?.businessProfile || {};
    const categories = Array.isArray(businessProfile.categories)
      ? businessProfile.categories.map((item) => item?.localized_display_name).filter(Boolean)
      : [];
    return {
      phoneNumber: cleanNumber,
      formattedNumber,
      countryCode,
      whatsappId,
      name: contactName,
      contactName,
      profilePicUrl,
      about,
      isBusiness: Boolean(contact?.isBusiness),
      isEnterprise: Boolean(contact?.isEnterprise),
      isMyContact: Boolean(contact?.isMyContact),
      isBlocked: Boolean(contact?.isBlocked),
      business: {
        description: businessProfile.description || '',
        categories,
        email: businessProfile.email || '',
        websites: Array.isArray(businessProfile.website) ? businessProfile.website : [],
        address: businessProfile.address || '',
      },
      rawPayload: {
        requestedNumber: cleanNumber,
        resolvedId: serializable(resolvedId),
        contact: serializable(contact?._data || contact),
        chat: serializable(chat?._data || chat),
        loadedName,
      },
    };
  };
}

module.exports = { createContactMetadataService };
