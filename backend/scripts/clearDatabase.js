const path = require('path');
const readline = require('readline/promises');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const KEEP_COLLECTIONS = new Set(['agents']);

async function confirmClear() {
  if (process.env.CONFIRM_CLEAR_DATABASE === 'YES') return true;

  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await terminal.question(
      'Isso apagará todos os dados, exceto os agentes. Digite APAGAR para continuar: ',
    );
    return answer.trim().toUpperCase() === 'APAGAR';
  } finally {
    terminal.close();
  }
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI não foi configurada.');
  if (!(await confirmClear())) {
    console.log('Operação cancelada.');
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionsToClear = collections
      .map((collection) => collection.name)
      .filter((name) => !KEEP_COLLECTIONS.has(name) && !name.startsWith('system.'));

    let deleted = 0;
    for (const name of collectionsToClear) {
      const result = await mongoose.connection.db.collection(name).deleteMany({});
      deleted += result.deletedCount;
      console.log(`${name}: ${result.deletedCount} registro(s) removido(s).`);
    }

    console.log(
      `Limpeza concluída. ${deleted} registro(s) removido(s). A coleção agents foi preservada.`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('Não foi possível limpar o banco:', error.message);
  process.exitCode = 1;
});
