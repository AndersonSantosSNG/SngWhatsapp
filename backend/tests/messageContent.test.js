const { messageText, displayMessageText } = require('../src/services/messageContent');
describe('message content', () => {
    it('uses media captions instead of raw thumbnail data', () => {
        expect(messageText({ type: 'image', body: '/9j/binary', _data: { caption: 'Foto' } })).toBe('Foto');
        expect(messageText({ type: 'image', body: '/9j/binary' })).toBe('[Mídia/Arquivo]');
        expect(messageText({ type: 'chat', body: 'Texto normal' })).toBe('Texto normal');
    });
    it('resolves only declared mentions and respects complete identifiers', async () => {
        const client = { getContactById: async () => ({ pushname: 'Ana' }) };
        expect(await displayMessageText({ body: 'Oi @123 e @1234', mentionedIds: ['123@lid'] }, client)).toBe('Oi @Ana e @1234');
    });
    it('keeps the original mention when contact lookup fails', async () => {
        expect(await displayMessageText({ body: 'Oi @123', mentionedIds: ['123@lid'] }, { getContactById: async () => { throw Error(); } })).toBe('Oi @123');
    });
});
