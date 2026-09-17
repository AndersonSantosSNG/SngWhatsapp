const BLOCKED_MIME =
  /^(text\/html|image\/svg\+xml|application\/(javascript|x-javascript|x-msdownload))$/i;

function looksDangerous(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return false;
  if (buffer.subarray(0, 2).toString('ascii') === 'MZ') return true;
  const head = buffer
    .subarray(0, Math.min(buffer.length, 512))
    .toString('utf8')
    .trimStart()
    .toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<svg');
}

function validateUploadedFile(file) {
  if (!file) return;
  if (BLOCKED_MIME.test(String(file.mimetype || '')) || looksDangerous(file.buffer)) {
    const error = new Error('O conteudo real deste arquivo nao e permitido.');
    error.statusCode = 400;
    throw error;
  }
}

module.exports = { BLOCKED_MIME, looksDangerous, validateUploadedFile };
