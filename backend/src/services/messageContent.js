const mediaTypes = new Set(['image', 'video', 'audio', 'ptt', 'document', 'sticker']);
function messageText(message) {
  const raw = message._data || {};
  if (mediaTypes.has(message.type || raw.type))
    return raw.caption || message.caption || '[Mídia/Arquivo]';
  return message.body || (message.hasMedia ? '[Mídia/Arquivo]' : '');
}
async function displayMessageText(message, client) {
  let text = messageText(message);
  const mentions = [...(message.mentionedIds || []), ...(message._data?.mentionedJidList || [])];
  const names = await Promise.all(
    mentions.map(async (mention) => {
      const id = typeof mention === 'string' ? mention : mention?._serialized || mention?.$1;
      if (!id) return null;
      try {
        const contact = await client.getContactById(id);
        const name = contact?.name || contact?.verifiedName || contact?.pushname;
        return name ? [id.split('@')[0], name] : null;
      } catch {
        return null;
      }
    }),
  );
  const lookup = new Map(names.filter(Boolean));
  if (mentions.length && client.pupPage) {
    try {
      const resolved = await client.pupPage.evaluate(async (mentions) => {
        const serialize = (id) => (typeof id === 'string' ? id : id?._serialized || id?.$1 || '');
        const contacts = window.require('WAWebCollections').Contact;
        const factory = window.require('WAWebWidFactory');
        const result = [];
        for (const mention of mentions) {
          const id = serialize(mention);
          if (!id) continue;
          try {
            const wid = factory.createWid(id);
            const candidates = [wid];
            try {
              const alternate = window.require('WAWebApiContact').getAlternateUserWid(wid);
              if (alternate) candidates.push(alternate);
            } catch {}
            let name = '';
            for (const candidate of candidates) {
              const contact = contacts.get(candidate) || contacts.get(serialize(candidate));
              name = contact?.name || contact?.verifiedName || contact?.pushname || '';
              if (name) break;
            }
            if (name) {
              for (const candidate of candidates)
                result.push([serialize(candidate).split('@')[0], name]);
              result.push([id.split('@')[0], name]);
            }
          } catch {}
        }
        return result;
      }, mentions);
      for (const [id, name] of resolved) lookup.set(id, name);
    } catch {}
  }
  return text.replace(/@(\d+)\b/g, (token, id) => (lookup.has(id) ? `@${lookup.get(id)}` : token));
}
async function hydrateStoredMentions(messages, client) {
  if (!client?.pupPage) return messages;
  const candidates = messages.filter(
    (message) => /@\d+\b/.test(message.body || '') && message.whatsappMessageId,
  );
  if (!candidates.length) return messages;
  try {
    const metadata = await client.pupPage.evaluate(
      async (ids) => {
        const collection = window.require('WAWebCollections').Msg;
        const missing = ids.filter((id) => !collection.get(id));
        let fetched = [];
        if (missing.length) {
          try {
            fetched = (await collection.getMessagesById(missing))?.messages || [];
          } catch {}
        }
        return ids.map((id) => {
          const model =
            collection.get(id) ||
            fetched.find((item) => (item.id?._serialized || item.id?.$1) === id);
          return {
            id,
            mentionedIds: (model?.mentionedJidList || [])
              .map((value) => (typeof value === 'string' ? value : value?._serialized || value?.$1))
              .filter(Boolean),
          };
        });
      },
      candidates.map((message) => message.whatsappMessageId),
    );
    const mentions = new Map(metadata.map((item) => [item.id, item.mentionedIds]));
    return Promise.all(
      messages.map(async (message) => {
        const mentionedIds = mentions.get(message.whatsappMessageId);
        if (!mentionedIds?.length) return message;
        const plain = message.toObject ? message.toObject() : message;
        return { ...plain, body: await displayMessageText({ ...plain, mentionedIds }, client) };
      }),
    );
  } catch {
    return messages;
  }
}
module.exports = { messageText, displayMessageText, hydrateStoredMentions };
