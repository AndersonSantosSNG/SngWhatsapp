const { sendAudio } = require('../src/services/audioSendService');

describe('audio send result', () => {
    it('waits for the send result and preserves voice and reply options', async () => {
        let finish;
        let receivedOptions;
        const client = { sendMessage: (_target, _media, options) => {
            receivedOptions = options;
            return new Promise(resolve => { finish = resolve; });
        } };
        let completed = false;
        const promise = sendAudio(client, 'test', { mimetype: 'audio/ogg; codecs=opus', data: 'YWJj' }, { sendAudioAsVoice: true, quotedMessageId: 'reply' }).then(() => { completed = true; });
        await Promise.resolve();
        expect(completed).toBe(false);
        expect(receivedOptions).toEqual({ sendAudioAsVoice: true, quotedMessageId: 'reply', waitUntilMsgSent: true });
        finish({ type: 'ptt', ack: 1 });
        await promise;
        expect(completed).toBe(true);
    });
    it('propagates send failures without retrying a potentially delivered message', async () => {
        let attempts = 0;
        const client = { sendMessage: async () => { attempts++; throw new Error('Upload failed'); } };
        await expect(sendAudio(client, 'test', { mimetype: 'audio/ogg', data: 'YWJj' }, {})).rejects.toThrow('Upload failed');
        expect(attempts).toBe(1);
    });
});

const { createHash } = require('node:crypto');
const { verifyPublishedAudio } = require('../src/services/audioSendService');
describe('published audio verification', () => {
    const data = Buffer.from('OggS-test');
    const hash = createHash('sha256').update(data).digest('base64');
    const sent = { type: 'ptt', _data: { directPath: '/test', mediaKey: 'key', filehash: hash } };
    const media = { data: data.toString('base64') };
    it('compares the remote decrypted bytes with the original and message hash', async () => {
        const client = { pupPage: { evaluate: async () => ({ status: 'downloaded', bytes: data.length, hash, ogg: true }) } };
        expect(await verifyPublishedAudio(client, sent, media)).toEqual({ status: 'downloaded', bytes: data.length, ogg: true, matchesOriginal: true, matchesMessageHash: true });
    });
    it('detects different remote content', async () => {
        const client = { pupPage: { evaluate: async () => ({ status: 'downloaded', bytes: 1, hash: 'different', ogg: false }) } };
        expect(await verifyPublishedAudio(client, sent, media)).toMatchObject({ matchesOriginal: false, matchesMessageHash: false });
    });
    it('reports remote failures without exposing keys or paths', async () => {
        const client = { pupPage: { evaluate: async () => ({ status: 'download_or_decryption_failed' }) } };
        expect(await verifyPublishedAudio(client, sent, media)).toEqual({ status: 'download_or_decryption_failed' });
    });
});
