const fs = require('fs');

const utilsPath = require.resolve('whatsapp-web.js/src/util/Injected/Utils.js');
const source = fs.readFileSync(utilsPath, 'utf8');
const oldMarker = 'delete message.__x_id; // SNG: WhatsApp Web media model ID collision';
const marker = '// SNG: restore message ID after spreading the WhatsApp media model';

if (source.includes(marker)) {
  console.log('[patch-whatsapp-web] Correcao de envio de midia ja aplicada.');
  process.exit(0);
}

const anchor = `        // Bot's won't reply if canonicalUrl is set (linking)`;
if (!source.includes(anchor)) {
  throw new Error(
    'Nao foi possivel aplicar a correcao de midia: estrutura do whatsapp-web.js desconhecida.',
  );
}

const patch = `        ${marker}\n        message.id = newMsgKey;\n        delete message.__x_id;`;
const patched = source.includes(oldMarker)
  ? source.replace(`        ${oldMarker}`, patch)
  : source.replace(anchor, `${patch}\n\n${anchor}`);

fs.writeFileSync(utilsPath, patched, 'utf8');
console.log('[patch-whatsapp-web] Correcao de envio de midia aplicada.');
