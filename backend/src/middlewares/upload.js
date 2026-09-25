const multer = require('multer');

const configuredLimitMb = Number.parseInt(process.env.MAX_UPLOAD_MB || '50', 10);
const maxUploadMb =
  Number.isFinite(configuredLimitMb) && configuredLimitMb > 0 ? configuredLimitMb : 50;
const MAX_UPLOAD_BYTES = maxUploadMb * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
    fields: 12,
    parts: 13,
    fieldNameSize: 100,
    fieldSize: 1024 * 1024,
    fieldArrayIndexLimit: 100,
  },
  fileFilter: (req, file, callback) => {
    const mimeType = String(file.mimetype || '').toLowerCase();
    const blocked =
      /^(text\/html|image\/svg\+xml|application\/(javascript|x-javascript|x-msdownload))$/;
    if (blocked.test(mimeType)) {
      return callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
    }
    callback(null, true);
  },
});

module.exports = upload;
module.exports.MAX_UPLOAD_BYTES = MAX_UPLOAD_BYTES;
module.exports.MAX_UPLOAD_MB = maxUploadMb;
