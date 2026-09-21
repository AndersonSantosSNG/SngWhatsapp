const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Agent = require('../src/models/Agent');
const AgentSession = require('../src/models/AgentSession');
const AuditLog = require('../src/models/AuditLog');
const Chat = require('../src/models/Chat');
const Message = require('../src/models/Message');
const apiRoutes = require('../src/routes/apiRoutes');

let mongo;
let app;

function passwordFields(password) {
  const passwordSalt = crypto.randomBytes(16).toString('hex');
  return {
    passwordSalt,
    passwordHash: crypto.scryptSync(password, passwordSalt, 64).toString('hex'),
  };
}

async function createAgent(email, role = 'agent') {
  return Agent.create({
    name: email.split('@')[0],
    corporateEmail: email,
    role,
    ...passwordFields('secret123'),
  });
}

async function login(email) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ corporateEmail: email, password: 'secret123' });
  const cookie = response.headers['set-cookie']?.[0] || '';
  const token = cookie.match(/agent_session=([^;]+)/)?.[1] || '';
  return { response, authorization: `Bearer ${token}` };
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
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  );
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
    await request(app)
      .post('/api/auth/login')
      .send({ corporateEmail: 'agent@sng.com.br', password: 'errada' })
      .expect(401);
    expect(await AuditLog.countDocuments({ action: 'auth.login_failed', success: false })).toBe(1);
  });

  it('envia codigo e redefine a senha dentro do prazo', async () => {
    const randomCode = vi.spyOn(crypto, 'randomInt').mockReturnValue(123456);
    await createAgent('recuperacao@sng.com.br');
    const { authorization } = await login('recuperacao@sng.com.br');

    await request(app)
      .post('/api/auth/forgot-password')
      .send({ corporateEmail: 'recuperacao@sng.com.br' })
      .expect(200);
    const verification = await request(app)
      .post('/api/auth/verify-reset-code')
      .send({
        corporateEmail: 'recuperacao@sng.com.br',
        code: '123456',
      })
      .expect(200);
    expect(verification.body.resetToken).toHaveLength(64);

    await request(app)
      .post('/api/auth/reset-password')
      .send({
        corporateEmail: 'recuperacao@sng.com.br',
        resetToken: verification.body.resetToken,
        password: 'nova-senha-segura',
      })
      .expect(200);

    await request(app).get('/api/auth/me').set('Authorization', authorization).expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ corporateEmail: 'recuperacao@sng.com.br', password: 'nova-senha-segura' })
      .expect(200);
    randomCode.mockRestore();
  });

  it('informa quando o e-mail de recuperacao nao esta cadastrado', async () => {
    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ corporateEmail: 'inexistente@sng.com.br' })
      .expect(404);
    expect(response.body.error).toMatch(/nao cadastrado/i);
  });

  it('bloqueia o codigo depois de tres tentativas incorretas', async () => {
    const randomCode = vi.spyOn(crypto, 'randomInt').mockReturnValue(654321);
    await createAgent('bloqueio@sng.com.br');
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ corporateEmail: 'bloqueio@sng.com.br' })
      .expect(200);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await request(app)
        .post('/api/auth/verify-reset-code')
        .send({ corporateEmail: 'bloqueio@sng.com.br', code: '000000' })
        .expect(400);
      if (attempt === 3) expect(response.body.error).toMatch(/bloqueado/i);
    }
    await request(app)
      .post('/api/auth/verify-reset-code')
      .send({ corporateEmail: 'bloqueio@sng.com.br', code: '654321' })
      .expect(400);
    randomCode.mockRestore();
  });

  it('não cria auditoria genérica para GETs e preserva ações relevantes', async () => {
    const admin = await createAgent('admin@sng.com.br', 'admin');
    const { authorization } = await login(admin.corporateEmail);

    await request(app).get('/api/auth/me').set('Authorization', authorization).expect(200);
    await request(app).get('/api/tickets').set('Authorization', authorization).expect(200);

    expect(await AuditLog.countDocuments({ action: 'api.request' })).toBe(0);

    const created = await request(app)
      .post('/api/api-clients')
      .set('Authorization', authorization)
      .send({ name: 'Site de teste', url: 'https://example.com' })
      .expect(201);

    expect(created.body.success).toBe(true);
    expect(await AuditLog.countDocuments({ action: 'api_client.create' })).toBe(1);
  });

  it('impede agente comum de acessar recursos administrativos', async () => {
    await createAgent('agent@sng.com.br');
    const { authorization } = await login('agent@sng.com.br');
    await request(app).get('/api/agents').set('Authorization', authorization).expect(403);
    await request(app).get('/api/audit-logs').set('Authorization', authorization).expect(403);
  });
});

describe('atendimentos', () => {
  it('lista apenas mensagens das últimas 48 horas para seleção no GLPI', async () => {
    const agent = await createAgent('agent@sng.com.br');
    const { authorization } = await login('agent@sng.com.br');
    const ticket = await Chat.create({
      phoneNumber: '5500000000001',
      assignedAgent: agent._id.toString(),
      status: 'open',
    });
    await Message.create({
      ticketId: ticket._id,
      phoneNumber: ticket.phoneNumber,
      sender: 'client',
      body: 'Recente',
      timestamp: new Date(),
    });
    await Message.create({
      ticketId: ticket._id,
      phoneNumber: ticket.phoneNumber,
      sender: 'client',
      body: 'Antiga',
      timestamp: new Date(Date.now() - 49 * 60 * 60 * 1000),
    });
    await Message.create({
      ticketId: ticket._id,
      phoneNumber: ticket.phoneNumber,
      sender: 'agent',
      body: 'Evento',
      isInternalEvent: true,
    });

    const response = await request(app)
      .get(`/api/tickets/${ticket._id}/glpi/messages`)
      .set('Authorization', authorization)
      .expect(200);
    expect(response.body.data.map((message) => message.body)).toEqual(['Recente']);
  });

  it('permite somente um vencedor ao assumir o mesmo ticket', async () => {
    await Promise.all([createAgent('a@sng.com.br'), createAgent('b@sng.com.br')]);
    const [{ authorization: first }, { authorization: second }] = await Promise.all([
      login('a@sng.com.br'),
      login('b@sng.com.br'),
    ]);
    const ticket = await Chat.create({ phoneNumber: '5511999999999', contactName: 'Cliente' });
    const results = await Promise.all([
      request(app)
        .post('/api/tickets/claim')
        .set('Authorization', first)
        .send({ ticketId: ticket._id }),
      request(app)
        .post('/api/tickets/claim')
        .set('Authorization', second)
        .send({ ticketId: ticket._id }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(await Message.countDocuments({ ticketId: ticket._id, internalAction: 'claimed' })).toBe(
      1,
    );
  });

  it('descarta ticket temporário vazio e preserva ticket com mensagem', async () => {
    await createAgent('agent@sng.com.br');
    const { authorization } = await login('agent@sng.com.br');
    const empty = await Chat.create({ phoneNumber: '5511111111111', isTemporary: true });
    const used = await Chat.create({ phoneNumber: '5522222222222', isTemporary: true });
    await Message.create({
      ticketId: used._id,
      phoneNumber: used.phoneNumber,
      sender: 'client',
      body: 'Olá',
    });

    const removed = await request(app)
      .post('/api/tickets/discard-temporary')
      .set('Authorization', authorization)
      .send({ ticketId: empty._id });
    const preserved = await request(app)
      .post('/api/tickets/discard-temporary')
      .set('Authorization', authorization)
      .send({ ticketId: used._id });
    expect(removed.body.discarded).toBe(true);
    expect(preserved.body.discarded).toBe(false);
    expect((await Chat.findById(used._id)).isTemporary).toBe(false);
  });

  it('pagina mensagens em ordem cronológica sem duplicar o limite', async () => {
    await createAgent('agent@sng.com.br');
    const { authorization } = await login('agent@sng.com.br');
    const ticket = await Chat.create({ phoneNumber: '5533333333333' });
    const base = Date.now() - 200000;
    await Message.insertMany(
      Array.from({ length: 125 }, (_, index) => ({
        ticketId: ticket._id,
        phoneNumber: ticket.phoneNumber,
        sender: index % 2 ? 'agent' : 'client',
        body: `Mensagem ${index}`,
        timestamp: new Date(base + index * 1000),
      })),
    );
    const first = await request(app)
      .get(`/api/tickets/${ticket._id}/messages?limit=100`)
      .set('Authorization', authorization)
      .expect(200);
    expect(first.body.data).toHaveLength(100);
    expect(first.body.meta.hasMore).toBe(true);
    expect(first.body.data[0].body).toBe('Mensagem 25');
    const older = await request(app)
      .get(
        `/api/tickets/${ticket._id}/messages?limit=100&before=${encodeURIComponent(first.body.data[0].timestamp)}`,
      )
      .set('Authorization', authorization)
      .expect(200);
    expect(older.body.data).toHaveLength(25);
    expect(older.body.meta.hasMore).toBe(false);
  });
});
