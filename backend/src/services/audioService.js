const { spawn } = require('node:child_process');
const ffmpegPath = require('ffmpeg-static');

// Convert the actual bytes: changing the extension does not convert WebM/MP4 to Ogg.
function convertVoiceAudio(base64) {
  return new Promise((resolve, reject) => {
    const input = Buffer.from(base64, 'base64');
    if (!input.length) return reject(new Error('O áudio está vazio. Grave novamente.'));
    if (!ffmpegPath) return reject(new Error('Conversor de áudio indisponível neste servidor.'));
    const process = spawn(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-map',
        '0:a:0',
        '-vn',
        '-ac',
        '1',
        '-ar',
        '48000',
        '-c:a',
        'libopus',
        '-b:a',
        '32k',
        '-application',
        'voip',
        '-f',
        'ogg',
        'pipe:1',
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const chunks = [];
    let outputSize = 0;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        process.kill();
        reject(error);
      } else resolve(value);
    };
    const timer = setTimeout(
      () =>
        finish(new Error('A conversão do áudio demorou demais. Tente uma gravação mais curta.')),
      60000,
    );
    process.on('error', () =>
      finish(new Error('Não foi possível iniciar o conversor de áudio no servidor.')),
    );
    process.stdin.on('error', () => {}); // FFmpeg may close stdin when the input is invalid.
    process.stderr.resume();
    process.stdout.on('data', (chunk) => {
      outputSize += chunk.length;
      if (outputSize > 16 * 1024 * 1024)
        return finish(new Error('Áudio muito grande. Envie uma gravação mais curta.'));
      chunks.push(chunk);
    });
    process.on('close', (code) => {
      const output = Buffer.concat(chunks);
      if (code !== 0 || output.subarray(0, 4).toString() !== 'OggS') {
        return finish(
          new Error(
            'Não foi possível converter o áudio. Grave novamente ou selecione outro arquivo.',
          ),
        );
      }
      finish(null, output.toString('base64'));
    });
    process.stdin.end(input);
  });
}

module.exports = { convertVoiceAudio };
