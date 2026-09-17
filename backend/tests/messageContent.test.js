const { messageText, displayMessageText } = require('../src/services/messageContent');
describe('message content', () => {
  it('uses media captions instead of raw thumbnail data', () => {
    expect(messageText({ type: 'image', body: '/9j/binary', _data: { caption: 'Foto' } })).toBe(
      'Foto',
    );
    expect(messageText({ type: 'image', body: '/9j/binary' })).toBe('[Mídia/Arquivo]');
    expect(messageText({ type: 'chat', body: 'Texto normal' })).toBe('Texto normal');
  });
  it('resolves only declared mentions and respects complete identifiers', async () => {
    const client = { getContactById: async () => ({ pushname: 'Ana' }) };
    expect(
      await displayMessageText({ body: 'Oi @123 e @1234', mentionedIds: ['123@lid'] }, client),
    ).toBe('Oi @Ana e @1234');
  });
  it('keeps the original mention when contact lookup fails', async () => {
    expect(
      await displayMessageText(
        { body: 'Oi @123', mentionedIds: ['123@lid'] },
        {
          getContactById: async () => {
            throw Error();
          },
        },
      ),
    ).toBe('Oi @123');
  });
});

const { hydrateStoredMentions } = require('../src/services/messageContent');
it('uses alternate LID names when the regular contact lookup fails', async () => {
  const client = {
    getContactById: async () => {
      throw Error();
    },
    pupPage: {
      evaluate: async () => [
        ['60657856729093', 'Ana'],
        ['5511999999999', 'Ana'],
      ],
    },
  };
  expect(
    await displayMessageText(
      { body: 'Oi @60657856729093', mentionedIds: ['5511999999999@c.us'] },
      client,
    ),
  ).toBe('Oi @Ana');
});
it('resolves mentions in stored messages without changing the stored object', async () => {
  const message = { body: 'Oi @123', whatsappMessageId: 'm1' };
  let calls = 0;
  const client = {
    getContactById: async () => ({ name: 'Ana' }),
    pupPage: {
      evaluate: async () =>
        ++calls === 1 ? [{ id: 'm1', mentionedIds: ['123@lid'] }] : [['123', 'Ana']],
    },
  };
  expect((await hydrateStoredMentions([message], client))[0].body).toBe('Oi @Ana');
  expect(message.body).toBe('Oi @123');
});
