const path = require('path');
const crypto = require('crypto');
const readline = require('readline/promises');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const Agent = require('../src/models/Agent');

async function main() {
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        const name = (process.env.ADMIN_NAME || await terminal.question('Nome do administrador: ')).trim();
        const corporateEmail = (process.env.ADMIN_EMAIL || await terminal.question('E-mail corporativo: ')).trim().toLowerCase();
        const password = process.env.ADMIN_PASSWORD || await terminal.question('Senha (minimo 6 caracteres): ');

        if (!name || !corporateEmail || password.length < 6) {
            throw new Error('Informe nome, e-mail e uma senha com pelo menos 6 caracteres.');
        }

        await mongoose.connect(process.env.MONGODB_URI);
        const passwordSalt = crypto.randomBytes(16).toString('hex');
        const passwordHash = crypto.scryptSync(password, passwordSalt, 64).toString('hex');
        const agent = await Agent.findOneAndUpdate(
            { corporateEmail },
            { name, corporateEmail, passwordSalt, passwordHash, role: 'admin', active: true },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log(`Administrador ${agent.name} criado/atualizado com sucesso.`);
    } finally {
        terminal.close();
        await mongoose.disconnect();
    }
}

main().catch(error => {
    console.error('Nao foi possivel criar o administrador:', error.message);
    process.exitCode = 1;
});
