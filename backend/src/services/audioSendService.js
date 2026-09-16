const { createHash } = require('node:crypto');

async function verifyPublishedAudio(client, sent, media) {
    const raw = sent?._data || {};
    const source = {
        directPath: raw.directPath, encFilehash: raw.encFilehash,
        filehash: raw.filehash, mediaKey: raw.mediaKey || sent?.mediaKey,
        mediaKeyTimestamp: raw.mediaKeyTimestamp, type: sent?.type
    };
    if (!source.directPath || !source.mediaKey || !client.pupPage) return { status: 'missing_metadata' };
    const expected = createHash('sha256').update(Buffer.from(media.data, 'base64')).digest('base64');
    try {
        // Bypass the message model/media cache: fetch and decrypt the published media.
        const result = await client.pupPage.evaluate(async source => {
            const downloadQpl = { addAnnotations() { return this; }, addPoint() { return this; } };
            const controller = new AbortController();
            let timer;
            try {
                const data = await Promise.race([
                    window.require('WAWebDownloadManager').downloadManager.downloadAndMaybeDecrypt({
                        ...source, signal: controller.signal, downloadQpl
                    }),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 15000);
                    })
                ]);
                const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
                const bytes = new Uint8Array(data);
                return {
                    status: 'downloaded', bytes: bytes.byteLength,
                    hash: btoa(String.fromCharCode(...digest)),
                    ogg: String.fromCharCode(...bytes.subarray(0, 4)) === 'OggS'
                };
            } catch (error) {
                return { status: controller.signal.aborted ? 'timeout' : 'download_or_decryption_failed' };
            } finally { clearTimeout(timer); }
        }, source);
        return {
            status: result.status,
            ...(result.status === 'downloaded' ? {
                bytes: result.bytes, ogg: result.ogg,
                matchesOriginal: result.hash === expected,
                matchesMessageHash: typeof source.filehash === 'string' ? result.hash === source.filehash : null
            } : {})
        };
    } catch {
        return { status: 'browser_verification_failed' };
    }
}

async function sendAudio(client, target, media, options) {
    const audio = Buffer.from(media.data || '', 'base64');
    const isVoice = options.sendAudioAsVoice === true;
    if (!audio.length) throw new Error('O arquivo de áudio está vazio. Grave novamente.');
    if (!String(media.mimetype || '').startsWith('audio/')) {
        throw new Error('O arquivo informado não possui um formato de áudio válido.');
    }
    if (isVoice && audio.subarray(0, 4).toString() !== 'OggS') {
        throw new Error('A mensagem de voz precisa estar no formato OGG/Opus.');
    }

    const input = { mimetype: media.mimetype, bytes: audio.length, voice: isVoice };
    console.info('[AUDIO][ENVIO]', input);
    try {
        const sent = await client.sendMessage(target, media, { ...options, waitUntilMsgSent: true });
        const raw = sent?._data || {};
        console.info('[AUDIO][RESULTADO]', {
            returnedMessage: Boolean(sent),
            type: sent?.type,
            ack: sent?.ack,
            mimetype: raw.mimetype,
            bytes: raw.size,
            duration: raw.duration,
            hasDirectPath: Boolean(raw.directPath),
            hasMediaKey: Boolean(raw.mediaKey || sent?.mediaKey),
            hasFileHash: Boolean(raw.filehash),
            hasEncryptedHash: Boolean(raw.encFilehash)
        });
        // Do not download the media again through private WhatsApp Web APIs here.
        // waitUntilMsgSent already reports the result and avoids a false failure after delivery.
        return sent;
    } catch (err) {
        console.error('[AUDIO][FALHA]', { ...input, error: String(err.message || err) });
        throw err;
    }
}
module.exports = { sendAudio, verifyPublishedAudio };
