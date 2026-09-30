const { createMediaService } = require('../src/services/whatsapp/mediaService');

describe('download de midia do WhatsApp', () => {
  it('usa metadados aninhados em mediaData no fallback', async () => {
    let evaluationPayload;
    const client = {
      pupPage: {
        evaluate: vi.fn(async (_callback, payload) => {
          evaluationPayload = payload;
          return null;
        }),
      },
    };
    const service = createMediaService({
      getClient: () => client,
      isClientReady: () => true,
    });

    await service.downloadMessageMediaFallback({
      id: { _serialized: 'false_5511999999999@c.us_TEST' },
      type: 'image',
      _data: {
        mediaData: {
          directPath: '/v/t62/test',
          encFilehash: 'encrypted-hash',
          filehash: 'file-hash',
          mediaKey: 'media-key',
          mediaKeyTimestamp: 123,
          mimetype: 'image/jpeg',
          filename: 'foto.jpg',
          size: 456,
        },
      },
    });

    expect(evaluationPayload).toEqual({
      id: 'false_5511999999999@c.us_TEST',
      fallbackMedia: {
        directPath: '/v/t62/test',
        encFilehash: 'encrypted-hash',
        filehash: 'file-hash',
        mediaKey: 'media-key',
        mediaKeyTimestamp: 123,
        type: 'image',
        mimetype: 'image/jpeg',
        filename: 'foto.jpg',
        size: 456,
      },
    });
  });
});
