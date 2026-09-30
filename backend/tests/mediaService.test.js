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

  it('encaminha o mimetype ao gerenciador de download do WhatsApp', async () => {
    let downloadOptions;
    const model = {
      directPath: '/v/t62/test',
      encFilehash: 'encrypted-hash',
      filehash: 'file-hash',
      mediaKey: 'media-key',
      mediaKeyTimestamp: 123,
      type: 'image',
      mimetype: 'image/jpeg',
      filename: 'foto.jpg',
      size: 456,
      mediaData: { mediaStage: 'RESOLVED' },
    };
    const previousWindow = global.window;
    global.window = {
      require: (moduleName) => {
        if (moduleName === 'WAWebCollections') {
          return { Msg: { get: () => model } };
        }
        if (moduleName === 'WAWebDownloadManager') {
          return {
            downloadManager: {
              downloadAndMaybeDecrypt: async (options) => {
                downloadOptions = options;
                return new Uint8Array([1, 2, 3]).buffer;
              },
            },
          };
        }
        throw new Error(`Modulo inesperado: ${moduleName}`);
      },
      WWebJS: { arrayBufferToBase64Async: async () => 'AQID' },
    };

    try {
      const client = { pupPage: { evaluate: (callback, payload) => callback(payload) } };
      const service = createMediaService({
        getClient: () => client,
        isClientReady: () => true,
      });
      const result = await service.downloadMessageMediaFallback({
        id: { _serialized: 'false_5511999999999@c.us_TEST' },
        type: 'image',
        _data: {},
      });

      expect(downloadOptions.mimetype).toBe('image/jpeg');
      expect(result).toMatchObject({
        data: 'AQID',
        mimetype: 'image/jpeg',
        filename: 'foto.jpg',
      });
    } finally {
      global.window = previousWindow;
    }
  });
});
