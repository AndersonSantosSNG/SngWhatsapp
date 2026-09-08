const { execFileSync } = require('node:child_process');
const ffmpegPath = require('ffmpeg-static');
const { convertVoiceAudio } = require('../src/services/audioService');

describe('voice audio conversion', () => {
    it.each(['webm', 'mp4'])('converts %s recordings to playable mono Opus in Ogg', async format => {
        const input = execFileSync(ffmpegPath, [
            '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
            '-i', 'sine=frequency=440:duration=0.2', '-ac', '2',
            '-c:a', format === 'webm' ? 'libopus' : 'aac',
            ...(format === 'mp4' ? ['-movflags', 'frag_keyframe+empty_moov'] : []),
            '-f', format, 'pipe:1'
        ], { windowsHide: true });
        const output = Buffer.from(await convertVoiceAudio(input.toString('base64')), 'base64');
        expect(output.subarray(0, 4).toString()).toBe('OggS');
        const header = output.indexOf(Buffer.from('OpusHead'));
        expect(header).toBeGreaterThan(0);
        expect(output[header + 9]).toBe(1);
        const pcm = execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-f', 's16le', 'pipe:1'], { input: output, windowsHide: true });
        expect(pcm.length).toBeGreaterThan(0);
    });
    it('rejects empty and invalid recordings with an actionable error', async () => {
        await expect(convertVoiceAudio('')).rejects.toThrow('vazio');
        await expect(convertVoiceAudio(Buffer.from('not audio').toString('base64'))).rejects.toThrow('converter');
    });
});
