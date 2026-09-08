// Narrow backport of wwebjs PR #201832; keep it reproducible on fresh installs.
const fs = require('node:fs');
function applyCompatibility() {
    const file = require.resolve('whatsapp-web.js/src/util/Injected/Utils.js');
    const original = fs.readFileSync(file, 'utf8');
    let source = original.replaceAll('newMsgKey._serialized', '(newMsgKey._serialized || newMsgKey.$1)');
    // Avoid applying the replacement again at the next startup.
    if (original.includes('(newMsgKey._serialized || newMsgKey.$1)')) source = original;
    const marker = 'const msg = message.serialize();';
    if (!source.includes('// SNG normalize message identifiers')) {
        source = source.replace(marker, `${marker}
        // SNG normalize message identifiers
        for (const key of ['id', 'from', 'to', 'author']) {
            const value = msg[key];
            if (value && typeof value === 'object' && !value._serialized && value.$1) value._serialized = value.$1;
        }
        if (msg.id?.remote && typeof msg.id.remote === 'object' && !msg.id.remote._serialized && msg.id.remote.$1) msg.id.remote._serialized = msg.id.remote.$1;`);
    }
    if (source !== original) fs.writeFileSync(file, source);
}
module.exports = { applyCompatibility };
