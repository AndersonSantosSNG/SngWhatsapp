const express = require('express');
const router = express.Router();
const checkApiKey = require('../middlewares/auth');
const upload = require('../middlewares/upload');
const qrController = require('../controllers/qrController');
const messageController = require('../controllers/messageController');
const whatsappService = require('../services/whatsappService');
const glpiService = require('../services/glpiService');

// Models do MongoDB
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const path = require('path');
const crypto = require('crypto');
const Agent = require('../models/Agent');
const ApiClient = require('../models/ApiClient');
const AgentSession = require('../models/AgentSession');
const AuditLog = require('../models/AuditLog');
const { hashApiKey } = require('../middlewares/auth');
const { audit, auditMiddleware } = require('../middlewares/audit');
const {
  MIN_PASSWORD_LENGTH,
  SESSION_DURATION_MS,
  hashSessionToken,
  publicAgent,
  requireAdmin,
  requireAgent,
  requireManagedMessage,
  requireManagedPanelSend,
  requireManagedTicket,
  setSessionCookie,
  verifyPassword,
} = require('../middlewares/agentAuth');
const { externalSendLimiter, loginLimiter } = require('../middlewares/rateLimits');
const ticketService = require('../services/ticketService');
const metrics = require('../services/metricsService');

router.use(auditMiddleware);

// --- ROTAS DE AUTENTICAÇÃO E QR CODE ---
router.get('/health', (req, res) => res.json({ success: true, status: 'ok' }));
router.get('/qr', requireAgent, qrController.getQrCodeJson);
router.get('/qr-image', requireAgent, qrController.getQrCodeImage);

router.post('/auth/login', loginLimiter, async (req, res) => {
  try {
    const corporateEmail = (req.body.corporateEmail || '').trim().toLowerCase();
    const password = req.body.password || '';
    const agent = await Agent.findOne({ corporateEmail, active: true }).select(
      '+passwordHash +passwordSalt',
    );
    if (!agent || !verifyPassword(password, agent)) {
      await audit(req, 'auth.login_failed', { success: false, details: { corporateEmail } });
      return res.status(401).json({ success: false, error: 'Usuario ou senha invalidos.' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    await AgentSession.create({
      tokenHash: hashSessionToken(token),
      agentId: agent._id,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    });
    await audit(req, 'auth.login', { actorId: agent._id, actorName: agent.name });
    setSessionCookie(res, token);
    res.json({ success: true, data: publicAgent(agent) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/auth/me', requireAgent, (req, res) =>
  res.json({ success: true, data: publicAgent(req.agent) }),
);

router.post('/auth/logout', requireAgent, async (req, res) => {
  await AgentSession.deleteOne({ tokenHash: req.agentTokenHash });
  await audit(req, 'auth.logout');
  res.clearCookie('agent_session', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    priority: 'high',
    path: '/',
  });
  res.json({ success: true });
});

router.patch('/auth/profile', requireAgent, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const currentPassword = req.body.currentPassword || '';
    const newPassword = req.body.newPassword || '';
    if (!name || !currentPassword)
      return res.status(400).json({ success: false, error: 'Informe o nome e a senha atual.' });
    const agent = await Agent.findById(req.agent._id).select('+passwordHash +passwordSalt');
    if (!agent || !verifyPassword(currentPassword, agent))
      return res.status(401).json({ success: false, error: 'Senha atual incorreta.' });
    if (newPassword && newPassword.length < MIN_PASSWORD_LENGTH)
      return res
        .status(400)
        .json({ success: false, error: 'A nova senha deve ter pelo menos 10 caracteres.' });
    agent.name = name;
    if (newPassword) {
      agent.passwordSalt = crypto.randomBytes(16).toString('hex');
      agent.passwordHash = crypto.scryptSync(newPassword, agent.passwordSalt, 64).toString('hex');
    }
    await agent.save();
    if (newPassword) {
      await AgentSession.deleteMany({ agentId: agent._id, _id: { $ne: req.agentSessionId } });
    }
    res.json({ success: true, data: publicAgent(agent) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/agents', requireAgent, requireAdmin, async (req, res) => {
  try {
    const agents = await Agent.find({}).sort({ active: -1, name: 1 });
    res.json({ success: true, data: agents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/agents', requireAgent, requireAdmin, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const corporateEmail = (req.body.corporateEmail || '').trim().toLowerCase();
    const password = req.body.password || '';

    if (!name || !corporateEmail || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        error: 'Preencha os campos e use uma senha com pelo menos 10 caracteres.',
      });
    }

    const passwordSalt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.scryptSync(password, passwordSalt, 64).toString('hex');
    const role = req.body.role === 'admin' ? 'admin' : 'agent';
    const agent = await Agent.create({ name, corporateEmail, passwordSalt, passwordHash, role });
    await audit(req, 'agent.create', {
      targetType: 'agent',
      targetId: agent._id,
      details: { corporateEmail, role },
    });

    res.status(201).json({
      success: true,
      data: publicAgent(agent),
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res
        .status(409)
        .json({ success: false, error: 'Este email corporativo ja esta cadastrado.' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/agents/:agentId/status', requireAgent, requireAdmin, async (req, res) => {
  try {
    const active = req.body.active;
    if (typeof active !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Informe um status valido.' });
    }
    if (!active && req.agent._id.toString() === req.params.agentId) {
      return res
        .status(400)
        .json({ success: false, error: 'Voce nao pode bloquear sua propria conta.' });
    }

    const agent = await Agent.findByIdAndUpdate(
      req.params.agentId,
      { active },
      { returnDocument: 'after' },
    );
    if (!agent) return res.status(404).json({ success: false, error: 'Agente nao encontrado.' });

    if (!active) {
      await AgentSession.deleteMany({ agentId: agent._id });
    }
    await audit(req, active ? 'agent.enable' : 'agent.disable', {
      targetType: 'agent',
      targetId: agent._id,
    });
    res.json({ success: true, data: publicAgent(agent) });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Nao foi possivel alterar o status do agente.' });
  }
});

// --- ROTA DE ENVIO EXTERNO (MANTÉM CHAVE DE API) ---
function normalizeOrigin(value) {
  const url = new URL(String(value || '').trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL inválida.');
  return url.origin;
}

function publicApiClient(client) {
  return {
    _id: client._id,
    name: client.name,
    allowedOrigin: client.allowedOrigin,
    keyPrefix: client.keyPrefix,
    active: client.active,
    createdAt: client.createdAt,
    lastUsedAt: client.lastUsedAt,
  };
}

router.get('/api-clients', requireAgent, requireAdmin, async (req, res) => {
  const clients = await ApiClient.find({}).sort({ active: -1, name: 1 });
  res.json({ success: true, data: clients.map(publicApiClient) });
});

router.post('/api-clients', requireAgent, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, error: 'Informe o nome do site.' });
    const allowedOrigin = normalizeOrigin(req.body.url);
    const apiKey = `sng_${crypto.randomBytes(32).toString('hex')}`;
    const client = await ApiClient.create({
      name,
      allowedOrigin,
      keyHash: hashApiKey(apiKey),
      keyPrefix: `${apiKey.slice(0, 12)}...`,
      createdBy: req.agent._id,
    });
    await audit(req, 'api_client.create', {
      targetType: 'api_client',
      targetId: client._id,
      details: { name, allowedOrigin },
    });
    res.status(201).json({ success: true, data: publicApiClient(client), apiKey });
  } catch (err) {
    res
      .status(400)
      .json({ success: false, error: err.message || 'Não foi possível criar a integração.' });
  }
});

router.patch('/api-clients/:clientId/status', requireAgent, requireAdmin, async (req, res) => {
  if (typeof req.body.active !== 'boolean')
    return res.status(400).json({ success: false, error: 'Status inválido.' });
  const client = await ApiClient.findByIdAndUpdate(
    req.params.clientId,
    { active: req.body.active },
    { returnDocument: 'after' },
  );
  if (!client) return res.status(404).json({ success: false, error: 'Integração não encontrada.' });
  await audit(req, req.body.active ? 'api_client.enable' : 'api_client.disable', {
    targetType: 'api_client',
    targetId: client._id,
  });
  res.json({ success: true, data: publicApiClient(client) });
});

router.post('/api-clients/:clientId/rotate', requireAgent, requireAdmin, async (req, res) => {
  const apiKey = `sng_${crypto.randomBytes(32).toString('hex')}`;
  const client = await ApiClient.findByIdAndUpdate(
    req.params.clientId,
    { keyHash: hashApiKey(apiKey), keyPrefix: `${apiKey.slice(0, 12)}...`, active: true },
    { returnDocument: 'after' },
  );
  if (!client) return res.status(404).json({ success: false, error: 'Integração não encontrada.' });
  await audit(req, 'api_client.rotate', { targetType: 'api_client', targetId: client._id });
  res.json({ success: true, data: publicApiClient(client), apiKey });
});

router.delete('/api-clients/:clientId', requireAgent, requireAdmin, async (req, res) => {
  const client = await ApiClient.findByIdAndDelete(req.params.clientId);
  if (!client) return res.status(404).json({ success: false, error: 'Integração não encontrada.' });
  await audit(req, 'api_client.delete', {
    targetType: 'api_client',
    targetId: client._id,
    details: { name: client.name },
  });
  res.json({ success: true, message: 'Integração e chave excluídas permanentemente.' });
});

router.get('/audit-logs', requireAgent, requireAdmin, async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit || '100', 10)));
  const logs = await AuditLog.find({}).sort({ createdAt: -1 }).limit(limit);
  res.json({ success: true, data: logs });
});

router.post(
  '/send-message',
  checkApiKey,
  externalSendLimiter,
  upload.single('file'),
  messageController.handleSendMessage,
);

// O painel usa a sessao autenticada; o agentId vem sempre do servidor.
router.post(
  '/panel/send-message',
  requireAgent,
  upload.single('file'),
  requireManagedPanelSend,
  (req, res, next) => {
    req.body.agentId = req.agent._id.toString();
    next();
  },
  messageController.handleSendMessage,
);

// --- NOVA ROTA: LISTAR CHATS, NOMES E GRUPOS ---
router.get('/whatsapp/chats', requireAgent, async (req, res) => {
  try {
    const chats = await whatsappService.getAllChats();
    res.json({ success: true, data: chats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/whatsapp/presence', requireAgent, async (req, res) => {
  const contactId = String(req.query.contactId || '');
  const phoneNumber = String(req.query.phoneNumber || '');
  if (!contactId) return res.status(400).json({ success: false, error: 'Informe o contato.' });

  const data = await whatsappService.getContactPresence(contactId, phoneNumber);
  res.json({ success: true, data });
});

router.post('/whatsapp/sync-history', requireAgent, requireAdmin, async (req, res) => {
  try {
    const data = await whatsappService.syncRecentMessages();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- ROTAS DO PAINEL INTERNO ---

router.get('/tickets', requireAgent, async (req, res) => {
  const startedAt = Date.now();
  try {
    const result = await ticketService.listTickets(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  } finally {
    metrics.increment('ticket_list_requests_total');
    metrics.gauge('ticket_list_latency_ms', Date.now() - startedAt);
  }
});

router.get('/tickets/:ticketId/members', requireAgent, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.ticketId);
    if (!chat) return res.status(404).json({ success: false, error: 'Conversa não encontrada.' });
    if (!chat.isGroup)
      return res.status(400).json({ success: false, error: 'Esta conversa não é um grupo.' });
    const data = await whatsappService.getGroupMembers(chat.whatsappId || chat.phoneNumber);
    res.json({ success: true, data });
  } catch (err) {
    res
      .status(503)
      .json({ success: false, error: err.message || 'Não foi possível carregar os membros.' });
  }
});

router.get('/tickets/:ticketId/messages', requireAgent, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit || '100', 10)));
    const filter = { ticketId: req.params.ticketId };
    if (req.query.before) {
      const before = new Date(req.query.before);
      if (!Number.isNaN(before.getTime())) filter.timestamp = { $lt: before };
    }
    const descending = await Message.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit + 1);
    const hasMore = descending.length > limit;
    const hydratedMessages = await whatsappService.resolveStoredMentions(
      descending.slice(0, limit).reverse(),
    );
    const messages = whatsappService.dedupeCallEvents(hydratedMessages);
    res.json({ success: true, data: messages, meta: { hasMore, limit } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/tickets/start', requireAgent, async (req, res) => {
  try {
    const phoneNumber = String(req.body?.phoneNumber || '').replace(/\D/g, '');
    if (phoneNumber.length < 10 || phoneNumber.length > 15) {
      return res
        .status(400)
        .json({ success: false, error: 'Informe o numero com DDD e codigo do pais.' });
    }

    const contact = await whatsappService.getContactMetadata(phoneNumber);
    let chat = await Chat.findOne({
      $or: [{ phoneNumber: contact.phoneNumber }, { whatsappId: contact.whatsappId }],
    });
    if (chat) {
      const hasMessages = await Message.exists({
        ticketId: chat._id,
        isInternalEvent: { $ne: true },
      });
      if (!hasMessages && chat.isTemporary) {
        await Chat.deleteOne({ _id: chat._id });
        chat = null;
      }
    }

    if (chat) {
      chat.phoneNumber = contact.phoneNumber;
      chat.whatsappId = contact.whatsappId;
      chat.contactName = contact.contactName;
      if (contact.profilePicUrl) chat.profilePicUrl = contact.profilePicUrl;
      chat.updatedAt = new Date();
      await chat.save();
    }

    const conversation = chat?.toObject() || {
      _id: `draft-${contact.phoneNumber}`,
      phoneNumber: contact.phoneNumber,
      whatsappId: contact.whatsappId,
      contactName: contact.contactName,
      profilePicUrl: contact.profilePicUrl || '',
      isGroup: false,
      isDraft: true,
      status: 'pending',
      lastMessage: '',
      lastMessageAt: null,
    };

    res.json({
      success: true,
      data: { ...conversation, name: contact.name },
      whatsappPayload: contact.rawPayload,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/contacts/info', requireAgent, async (req, res) => {
  try {
    const phoneNumber = String(req.query.phoneNumber || '').replace(/\D/g, '');
    if (phoneNumber.length < 10 || phoneNumber.length > 15) {
      return res.status(400).json({ success: false, error: 'Número inválido.' });
    }
    const { rawPayload, ...contact } = await whatsappService.getContactMetadata(phoneNumber);
    res.json({ success: true, data: contact });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message || 'Não foi possível consultar o perfil do contato.',
    });
  }
});

router.post('/tickets/discard-temporary', requireAgent, async (req, res) => {
  try {
    const chat = await Chat.findOne({ _id: req.body?.ticketId, isTemporary: true });
    if (!chat) return res.json({ success: true, discarded: false });

    const hasMessages = await Message.exists({
      ticketId: chat._id,
      isInternalEvent: { $ne: true },
    });
    if (hasMessages) {
      chat.isTemporary = false;
      await chat.save();
      return res.json({ success: true, discarded: false });
    }

    await Chat.deleteOne({ _id: chat._id, isTemporary: true });
    res.json({ success: true, discarded: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/messages/:messageId/media', requireAgent, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message?.hasMedia || !message.mediaPath) return res.status(404).end();

    const mediaDirectory = path.resolve(__dirname, '..', '..', '..', 'storage', 'media');
    const absolutePath = path.resolve(mediaDirectory, message.mediaPath);
    if (!absolutePath.startsWith(`${mediaDirectory}${path.sep}`)) return res.status(400).end();

    const inlineMimeTypes = /^(image\/(?:avif|gif|jpeg|png|webp)|audio\/|video\/)/i;
    const mimeType = message.mediaMimeType || 'application/octet-stream';
    const disposition = inlineMimeTypes.test(mimeType) ? 'inline' : 'attachment';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(message.mediaFileName || 'arquivo')}"`,
    );
    res.sendFile(absolutePath);
  } catch (err) {
    res.status(404).end();
  }
});

router.patch('/messages/:messageId', requireAgent, requireManagedMessage, async (req, res) => {
  try {
    const data = await whatsappService.editMessage(req.params.messageId, req.body?.body);
    await audit(req, 'message.edit', {
      targetType: 'message',
      targetId: req.params.messageId,
      details: { ticketId: data.ticketId },
    });
    res.json({ success: true, data });
  } catch (err) {
    await audit(req, 'message.edit', {
      targetType: 'message',
      targetId: req.params.messageId,
      success: false,
      details: { error: err.message },
    });
    res
      .status(400)
      .json({ success: false, error: err.message || 'Nao foi possivel editar a mensagem.' });
  }
});

router.delete(
  '/messages/:messageId/everyone',
  requireAgent,
  requireManagedMessage,
  async (req, res) => {
    try {
      const data = await whatsappService.revokeMessage(req.params.messageId);
      await audit(req, 'message.revoke', {
        targetType: 'message',
        targetId: req.params.messageId,
        details: { ticketId: data.ticketId },
      });
      res.json({ success: true, data });
    } catch (err) {
      await audit(req, 'message.revoke', {
        targetType: 'message',
        targetId: req.params.messageId,
        success: false,
        details: { error: err.message },
      });
      res
        .status(400)
        .json({ success: false, error: err.message || 'Nao foi possivel apagar a mensagem.' });
    }
  },
);

router.get('/tickets/:ticketId/profile-picture', requireAgent, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.ticketId);
    if (!chat) {
      return res.status(404).end();
    }

    const picture = await whatsappService.getProfilePicture(
      chat.whatsappId || chat.phoneNumber,
      chat.isGroup,
      chat.profilePicUrl,
    );
    // Ausencia de foto e um estado normal; 204 evita tratar o avatar padrao como erro no frontend.
    if (!picture) return res.status(204).end();

    res.setHeader('Cache-Control', 'private, max-age=300');
    res.type(picture.contentType).send(picture.buffer);
  } catch (err) {
    res.status(404).end();
  }
});

router.get('/tickets/:ticketId/contact-info', requireAgent, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.ticketId);
    if (!chat || chat.isGroup) {
      return res.status(404).json({ success: false, error: 'Contato não encontrado.' });
    }

    const contact = await whatsappService.getContactMetadata(chat.phoneNumber);
    if (contact.contactName && contact.contactName !== contact.phoneNumber) {
      chat.contactName = contact.contactName;
    }
    chat.whatsappId = contact.whatsappId || chat.whatsappId;
    if (contact.profilePicUrl) chat.profilePicUrl = contact.profilePicUrl;
    await chat.save();

    const { rawPayload, ...publicContact } = contact;
    res.json({ success: true, data: publicContact });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message || 'Não foi possível consultar o perfil do contato.',
    });
  }
});

router.post('/tickets/claim', requireAgent, async (req, res) => {
  try {
    const { ticketId } = req.body;
    const chat = await Chat.findOneAndUpdate(
      { _id: ticketId, status: { $ne: 'open' } },
      { assignedAgent: req.agent._id.toString(), status: 'open', updatedAt: new Date() },
      { returnDocument: 'after' },
    );

    if (!chat) {
      const current = await Chat.findById(ticketId);
      if (!current)
        return res.status(404).json({ success: false, error: 'Ticket não encontrado.' });
      return res.status(409).json({
        success: false,
        error: 'Este atendimento já foi assumido por outro agente.',
        data: current,
      });
    }

    await whatsappService.recordChatEvent(chat, req.agent, 'claimed');
    await audit(req, 'chat.claim', { targetType: 'chat', targetId: chat._id });
    res.json({ success: true, message: 'Atendimento assumido!', data: chat });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/tickets/close', requireAgent, async (req, res) => {
  try {
    const { ticketId } = req.body;
    const chat = await Chat.findOneAndUpdate(
      {
        _id: ticketId,
        ...(req.agent.role === 'admin' ? {} : { assignedAgent: req.agent._id.toString() }),
      },
      { status: 'closed', updatedAt: new Date() },
      { returnDocument: 'after' },
    );

    if (!chat) return res.status(404).json({ success: false, error: 'Ticket não encontrado.' });
    await whatsappService.recordChatEvent(chat, req.agent, 'closed');
    await audit(req, 'chat.close', { targetType: 'chat', targetId: chat._id });
    res.json({ success: true, message: 'Atendimento encerrado!', data: chat });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/tickets/unclaim', requireAgent, async (req, res) => {
  try {
    const { ticketId } = req.body;
    const chat = await Chat.findById(ticketId);
    if (!chat) {
      return res.status(404).json({ success: false, error: 'Ticket não encontrado.' });
    }

    if (!canManageChat(req.agent, chat)) {
      return res
        .status(403)
        .json({ success: false, error: 'Atendimento atribuído a outro agente.' });
    }

    chat.status = 'pending';
    chat.assignedAgent = null;
    chat.updatedAt = new Date();
    await chat.save();

    await whatsappService.recordChatEvent(chat, req.agent, 'unclaimed');
    await audit(req, 'chat.unclaim', { targetType: 'chat', targetId: chat._id });

    return res.status(200).json({ success: true, data: chat });
  } catch (err) {
    console.error('Erro ao devolver chat:', err);
    return res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
  }
});

router.get(
  '/tickets/:ticketId/glpi/messages',
  requireAgent,
  requireManagedTicket,
  async (req, res) => {
    try {
      const chat = await Chat.findById(req.params.ticketId);
      if (!chat) return res.status(404).json({ success: false, error: 'Conversa não encontrada.' });
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const messages = await Message.find({
        ticketId: chat._id,
        timestamp: { $gte: since },
        isInternalEvent: { $ne: true },
      })
        .sort({ timestamp: 1 })
        .select(
          '_id sender body hasMedia mediaPath mediaFileName mediaMimeType timestamp groupSenderName',
        )
        .lean();
      res.json({
        success: true,
        data: messages.map((message) => ({
          _id: message._id,
          sender: message.sender,
          body: message.body,
          hasMedia: message.hasMedia,
          attachmentAvailable: Boolean(message.hasMedia && message.mediaPath),
          mediaFileName: message.mediaFileName,
          mediaMimeType: message.mediaMimeType,
          timestamp: message.timestamp,
          groupSenderName: message.groupSenderName,
        })),
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Não foi possível carregar as mensagens.' });
    }
  },
);

router.post('/tickets/:ticketId/glpi', requireAgent, requireManagedTicket, async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    if (!title)
      return res.status(400).json({ success: false, error: 'Informe o título do chamado.' });
    if (title.length > 255)
      return res
        .status(400)
        .json({ success: false, error: 'O título deve ter no máximo 255 caracteres.' });
    const messageIds = Array.isArray(req.body?.messageIds)
      ? [...new Set(req.body.messageIds.map(String))]
      : [];
    const attachmentMessageIds = Array.isArray(req.body?.attachmentMessageIds)
      ? [...new Set(req.body.attachmentMessageIds.map(String))]
      : [];
    if (!messageIds.length)
      return res.status(400).json({ success: false, error: 'Selecione pelo menos uma mensagem.' });
    if (messageIds.some((id) => !/^[a-f\d]{24}$/i.test(id)))
      return res
        .status(400)
        .json({ success: false, error: 'A seleção contém uma mensagem inválida.' });
    if (attachmentMessageIds.some((id) => !messageIds.includes(id)))
      return res.status(400).json({
        success: false,
        error: 'Só é possível anexar arquivos de mensagens selecionadas.',
      });

    const chat = await Chat.findById(req.params.ticketId);
    if (!chat) return res.status(404).json({ success: false, error: 'Conversa não encontrada.' });
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const messages = await Message.find({
      ticketId: chat._id,
      _id: { $in: messageIds },
      timestamp: { $gte: since },
      isInternalEvent: { $ne: true },
    })
      .sort({ timestamp: 1 })
      .lean();
    if (!messages.length)
      return res.status(400).json({
        success: false,
        error: 'Nenhuma das mensagens selecionadas está disponível nas últimas 48 horas.',
      });

    const mediaDirectory = path.resolve(__dirname, '..', '..', '..', 'storage', 'media');
    const attachments = messages
      .filter(
        (message) =>
          attachmentMessageIds.includes(String(message._id)) &&
          message.hasMedia &&
          message.mediaPath,
      )
      .flatMap((message) => {
        const filePath = path.resolve(mediaDirectory, message.mediaPath);
        if (!filePath.startsWith(`${mediaDirectory}${path.sep}`)) return [];
        return [
          {
            filePath,
            fileName: message.mediaFileName || path.basename(filePath),
            mimeType: message.mediaMimeType,
          },
        ];
      });
    const created = await glpiService.createTicket({
      title,
      messages,
      contactName: chat.contactName,
      attachments,
    });
    const glpiTicketUrl = glpiService.ticketUrl(created.id);
    await whatsappService
      .recordGlpiTicketEvent(chat, req.agent, created.id, glpiTicketUrl)
      .catch((err) => console.error('[GLPI][REGISTRAR EVENTO]', err.message));
    await audit(req, 'glpi.chat_create', {
      targetType: 'chat',
      targetId: chat._id,
      details: {
        glpiTicketId: created.id,
        messageCount: messages.length,
        uploadedAttachmentCount: created.uploadedAttachments.length,
        failedAttachmentCount: created.failedAttachments.length,
      },
    });
    const failedCount = created.failedAttachments.length;
    res.status(201).json({
      success: true,
      message: failedCount
        ? `Chamado #${created.id} aberto, mas ${failedCount} arquivo(s) não puderam ser anexados.`
        : `Chamado #${created.id} aberto com ${created.uploadedAttachments.length} arquivo(s)!`,
      data: {
        id: created.id,
        url: glpiTicketUrl,
        messageCount: messages.length,
        uploadedAttachments: created.uploadedAttachments,
        failedAttachments: created.failedAttachments,
      },
    });
  } catch (err) {
    console.error('[GLPI][ABRIR CHAMADO]', err.message);
    res
      .status(502)
      .json({ success: false, error: err.message || 'Não foi possível abrir o chamado no GLPI.' });
  }
});

// --- ROTA DE LIMPEZA DO BANCO DE DADOS ---
router.delete('/database/clear', requireAgent, requireAdmin, async (req, res) => {
  try {
    await Chat.deleteMany({});
    await Message.deleteMany({});
    await audit(req, 'database.clear', {
      targetType: 'database',
      targetId: 'all',
      details: { collections: ['Chat', 'Message'] },
    });
    res.json({
      success: true,
      message: 'Banco de dados limpo com sucesso! Todos os tickets e mensagens foram removidos.',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
