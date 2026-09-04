const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Agent = require('../src/models/Agent');
const AgentSession = require('../src/models/AgentSession');
const AuditLog = require('../src/models/AuditLog');
const Ticket = require('../src/models/Ticket');
const Message = require('../src/models/Message');
const apiRoutes = require('../src/routes/apiRoutes');

let mongo;
let app;

function passwordFields(password) {
    const passwordSalt = crypto.randomBytes(16).toString('hex');
    return { passwordSalt, passwordHash: crypto.scryptSync(password, passwordSalt, 64).toString('hex') };
}

async function createAgent(email, role = 'agent') {
    return Agent.create({ name: email.split('@')[0], corporateEmail: email, role, ...passwordFields('secret123') });
}

async function login(email) {
    const response = await request(app).post('/api/auth/login').send({ corporateEmail: email, password: 'secret123' });
    return { response, authorization: `Bearer ${response.body.token}` };
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    app = express();
    app.use(express.json());
    app.use('/api', apiRoutes);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
});

beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
});

describe('autenticação e autorização', () => {
    it('responde ao health check sem exigir sessão', async () => {
        const response = await request(app).get('/api/health').expect(200);
        expect(response.body).toEqual({ success: true, status: 'ok' });
    });

    it('bloqueia dados do painel sem sessão', async () => {
        await request(app).get('/api/tickets').expect(401);
        await request(app).get('/api/whatsapp/chats').expect(401);
    });

    it('cria sessão persistente, cookie HttpOnly e auditoria no login', async () => {
        const agent = await createAgent('admin@sng.com.br', 'admin');
        const { response, authorization } = await login(agent.corporateEmail);
        expect(response.status).toBe(200);
        expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
        expect(await AgentSession.countDocuments()).toBe(1);
        await request(app).get('/api/auth/me').set('Authorization', authorization).expect(200);
        expect(await AuditLog.countDocuments({ action: 'auth.login' })).toBe(1);
    });

    it('rejeita senha inválida e registra a tentativa', async () => {
        await createAgent('agent@sng.com.br');
        await request(app).post('/api/auth/login').send({ corporateEmail: 'agent@sng.com.br', password: 'errada' }).expect(401);
        expect(await AuditLog.countDocuments({ action: 'auth.login_failed', success: false })).toBe(1);
    });

    it('impede agente comum de acessar recursos administrativos', async () => {
        await createAgent('agent@sng.com.br');
        const { authorization } = await login('agent@sng.com.br');
        await request(app).get('/api/agents').set('Authorization', authorization).expect(403);
        await request(app).get('/api/audit-logs').set('Authorization', authorization).expect(403);
    });
});

describe('atendimentos', () => {
    it('permite somente um vencedor ao assumir o mesmo ticket', async () => {
        await Promise.all([createAgent('a@sng.com.br'), createAgent('b@sng.com.br')]);
        const [{ authorization: first }, { authorization: second }] = await Promise.all([login('a@sng.com.br'), login('b@sng.com.br')]);
        const ticket = await Ticket.create({ phoneNumber: '5511999999999', contactName: 'Cliente' });
        const results = await Promise.all([
            request(app).post('/api/tickets/claim').set('Authorization', first).send({ ticketId: ticket._id }),
            request(app).post('/api/tickets/claim').set('Authorization', second).send({ ticketId: ticket._id })
        ]);
        expect(results.map(result => result.status).sort()).toEqual([200, 409]);
        expect(await Message.countDocuments({ ticketId: ticket._id, internalAction: 'claimed' })).toBe(1);
    });

    it('descarta ticket temporário vazio e preserva ticket com mensagem', async () => {
        await createAgent('agent@sng.com.br');
        const { authorization } = await login('agent@sng.com.br');
        const empty = await Ticket.create({ phoneNumber: '5511111111111', isTemporary: true });
        const used = await Ticket.create({ phoneNumber: '5522222222222', isTemporary: true });
        await Message.create({ ticketId: used._id, phoneNumber: used.phoneNumber, sender: 'client', body: 'Olá' });

        const removed = await request(app).post('/api/tickets/discard-temporary').set('Authorization', authorization).send({ ticketId: empty._id });
        const preserved = await request(app).post('/api/tickets/discard-temporary').set('Authorization', authorization).send({ ticketId: used._id });
        expect(removed.body.discarded).toBe(true);
        expect(preserved.body.discarded).toBe(false);
        expect((await Ticket.findById(used._id)).isTemporary).toBe(false);
    });

    it('pagina mensagens em ordem cronológica sem duplicar o limite', async () => {
        await createAgent('agent@sng.com.br');
        const { authorization } = await login('agent@sng.com.br');
        const ticket = await Ticket.create({ phoneNumber: '5533333333333' });
        const base = Date.now() - 200000;
        await Message.insertMany(Array.from({ length: 125 }, (_, index) => ({
            ticketId: ticket._id,
            phoneNumber: ticket.phoneNumber,
            sender: index % 2 ? 'agent' : 'client',
            body: `Mensagem ${index}`,
            timestamp: new Date(base + index * 1000)
        })));
        const first = await request(app).get(`/api/tickets/${ticket._id}/messages?limit=100`).set('Authorization', authorization).expect(200);
        expect(first.body.data).toHaveLength(100);
        expect(first.body.meta.hasMore).toBe(true);
        expect(first.body.data[0].body).toBe('Mensagem 25');
        const older = await request(app).get(`/api/tickets/${ticket._id}/messages?limit=100&before=${encodeURIComponent(first.body.data[0].timestamp)}`).set('Authorization', authorization).expect(200);
        expect(older.body.data).toHaveLength(25);
        expect(older.body.meta.hasMore).toBe(false);
    });
});
