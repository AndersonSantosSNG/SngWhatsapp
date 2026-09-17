const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
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
