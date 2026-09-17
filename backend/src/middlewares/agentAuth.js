const crypto = require('crypto');
const Agent = require('../models/Agent');
const AgentSession = require('../models/AgentSession');
const Chat = require('../models/Chat');
const Message = require('../models/Message');

const SESSION_DURATION_MS = Math.min(
  7 * 24 * 60 * 60 * 1000,
  Math.max(60 * 60 * 1000, Number(process.env.SESSION_DURATION_HOURS || 12) * 60 * 60 * 1000),
);
const MIN_PASSWORD_LENGTH = 10;

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function publicAgent(agent) {
  return {
    _id: agent._id,
    name: agent.name,
    corporateEmail: agent.corporateEmail,
    role: agent.role || 'agent',
    active: agent.active,
    showApiMessages: agent.role === 'admin' && agent.showApiMessages === true,
  };
}

function verifyPassword(password, agent) {
  const candidate = crypto.scryptSync(password, agent.passwordSalt, 64);
  const saved = Buffer.from(agent.passwordHash, 'hex');
  return candidate.length === saved.length && crypto.timingSafeEqual(candidate, saved);
}

function setSessionCookie(res, token) {
  res.cookie('agent_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    priority: 'high',
    path: '/',
    maxAge: SESSION_DURATION_MS,
  });
}

async function requireAgent(req, res, next) {
  try {
    const cookieToken = String(req.headers.cookie || '')
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('agent_session='))
      ?.split('=')
      .slice(1)
      .join('=');
    const token =
      (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
      decodeURIComponent(cookieToken || '');
    const tokenHash = token ? hashSessionToken(token) : '';
    const session = tokenHash
      ? await AgentSession.findOne({ tokenHash, expiresAt: { $gt: new Date() } })
      : null;
    if (!session) {
      return res.status(401).json({ success: false, error: 'Sessao expirada. Entre novamente.' });
    }
    const agent = await Agent.findOne({ _id: session.agentId, active: true });
    if (!agent) {
      return res.status(401).json({ success: false, error: 'Agente nao encontrado ou inativo.' });
    }
    req.agent = agent;
    req.agentSessionId = session._id;
    req.agentTokenHash = tokenHash;
    setSessionCookie(res, token);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Sessao invalida.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.agent?.role !== 'admin') {
    return res
      .status(403)
      .json({ success: false, error: 'Somente administradores podem cadastrar agentes.' });
  }
  next();
}

function canManageChat(agent, chat) {
  return (
    agent?.role === 'admin' ||
    (chat?.assignedAgent && String(chat.assignedAgent) === String(agent?._id || ''))
  );
}

async function requireManagedMessage(req, res, next) {
  try {
    const message = await Message.findById(req.params.messageId).select('ticketId');
    const chat = message ? await Chat.findById(message.ticketId).select('assignedAgent') : null;
    if (!message || !chat)
      return res.status(404).json({ success: false, error: 'Mensagem não encontrada.' });
    if (!canManageChat(req.agent, chat))
      return res
        .status(403)
        .json({ success: false, error: 'Atendimento atribuído a outro agente.' });
    next();
  } catch {
    res.status(400).json({ success: false, error: 'Identificador de mensagem inválido.' });
  }
}

async function requireManagedPanelSend(req, res, next) {
  try {
    const number = String(req.body?.number || '');
    const digits = number.replace(/\D/g, '');
    const chat = await Chat.findOne({
      $or: [{ phoneNumber: digits }, { phoneNumber: number }, { whatsappId: number }],
    }).select('assignedAgent');
    if (!chat)
      return res.status(404).json({ success: false, error: 'Atendimento não encontrado.' });
    if (!canManageChat(req.agent, chat))
      return res
        .status(403)
        .json({ success: false, error: 'Assuma o atendimento antes de enviar.' });
    next();
  } catch {
    res.status(400).json({ success: false, error: 'Não foi possível validar o atendimento.' });
  }
}

async function requireManagedTicket(req, res, next) {
  try {
    const chat = await Chat.findById(req.params.ticketId).select('assignedAgent');
    if (!chat)
      return res.status(404).json({ success: false, error: 'Atendimento não encontrado.' });
    if (!canManageChat(req.agent, chat))
      return res
        .status(403)
        .json({ success: false, error: 'Atendimento atribuído a outro agente.' });
    next();
  } catch {
    res.status(400).json({ success: false, error: 'Identificador de atendimento inválido.' });
  }
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  SESSION_DURATION_MS,
  canManageChat,
  hashSessionToken,
  publicAgent,
  requireAdmin,
  requireAgent,
  requireManagedMessage,
  requireManagedPanelSend,
  requireManagedTicket,
  setSessionCookie,
  verifyPassword,
};
