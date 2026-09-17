// Narrow backport of wwebjs PR #201832; keep it reproducible on fresh installs.
const fs = require('node:fs');
function applyCompatibility() {
  const file = require.resolve('whatsapp-web.js/src/util/Injected/Utils.js');
  const clientFile = require.resolve('whatsapp-web.js/src/Client.js');
  const original = fs.readFileSync(file, 'utf8');
  let source = original.replaceAll(
    'newMsgKey._serialized',
    '(newMsgKey._serialized || newMsgKey.$1)',
  );
  // Avoid applying the replacement again at the next startup.
  if (original.includes('(newMsgKey._serialized || newMsgKey.$1)')) source = original;
  const marker = 'const msg = message.serialize();';
  if (!source.includes('// SNG normalize message identifiers')) {
    source = source.replace(
      marker,
      `${marker}
        // SNG normalize message identifiers
        for (const key of ['id', 'from', 'to', 'author']) {
            const value = msg[key];
            if (value && typeof value === 'object' && !value._serialized && value.$1) value._serialized = value.$1;
        }
        if (msg.id?.remote && typeof msg.id.remote === 'object' && !msg.id.remote._serialized && msg.id.remote.$1) msg.id.remote._serialized = msg.id.remote.$1;`,
    );
  }
  if (source !== original) fs.writeFileSync(file, source);

  // This guard lives in Client.js (not Injected/Utils.js). Only change the
  // Msg.on('add') guard; the earlier occurrence belongs to message removal.
  const clientOriginal = fs.readFileSync(clientFile, 'utf8');
  const addListenerMarker = "Msg.on('add', (msg) => {";
  const markerIndex = clientOriginal.indexOf(addListenerMarker);
  if (markerIndex >= 0) {
    const prefix = clientOriginal.slice(0, markerIndex);
    const listener = clientOriginal
      .slice(markerIndex)
      .replace(
        'if (!msg.isNewMsg) return;',
        "if (!msg.isNewMsg && msg.type !== 'call_log') return;",
      );
    const clientSource = prefix + listener;
    if (clientSource !== clientOriginal) fs.writeFileSync(clientFile, clientSource);
  }
}
module.exports = { applyCompatibility };
