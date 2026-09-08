const mediaTypes = new Set(['image', 'video', 'audio', 'ptt', 'document', 'sticker']);
function messageText(message) {
    const raw = message._data || {};
    if (mediaTypes.has(message.type || raw.type)) return raw.caption || message.caption || '[Mídia/Arquivo]';
    return message.body || (message.hasMedia ? '[Mídia/Arquivo]' : '');
}
async function displayMessageText(message, client) {
    let text = messageText(message);
    const mentions = message.mentionedIds || message._data?.mentionedJidList || [];
    const names = await Promise.all(mentions.map(async mention => {
        const id = typeof mention === 'string' ? mention : mention?._serialized || mention?.$1;
        if (!id) return null;
        try {
            const contact = await client.getContactById(id);
            const name = contact?.name || contact?.verifiedName || contact?.pushname;
            return name ? [id.split('@')[0], name] : null;
        } catch { return null; }
    }));
    const lookup = new Map(names.filter(Boolean));
    return text.replace(/@(\d+)\b/g, (token, id) => lookup.has(id) ? `@${lookup.get(id)}` : token);
}
module.exports = { messageText, displayMessageText };
