const express = require('express');
const router = express.Router();
const checkApiKey = require('../middlewares/auth');
const upload = require('../middlewares/upload');
const qrController = require('../controllers/qrController');
const messageController = require('../controllers/messageController');
const whatsappService = require('../services/whatsappService');

// Models do MongoDB
const Ticket = require('../models/Ticket');
const Message = require('../models/Message');
const path = require('path');
const crypto = require('crypto');
const Agent = require('../models/Agent');

const agentSessions = new Map();
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

function publicAgent(agent) {
    return { _id: agent._id, name: agent.name, corporateEmail: agent.corporateEmail, role: agent.role || 'agent', active: agent.active };
}

function verifyPassword(password, agent) {
    const candidate = crypto.scryptSync(password, agent.passwordSalt, 64);
    const saved = Buffer.from(agent.passwordHash, 'hex');
    return candidate.length === saved.length && crypto.timingSafeEqual(candidate, saved);
}

async function requireAgent(req, res, next) {
    try {
        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        const session = agentSessions.get(token);
        if (!session || session.expiresAt <= Date.now()) {
            if (token) agentSessions.delete(token);
            return res.status(401).json({ success: false, error: 'Sessao expirada. Entre novamente.' });
        }
        const agent = await Agent.findOne({ _id: session.agentId, active: true });
        if (!agent) return res.status(401).json({ success: false, error: 'Agente nao encontrado ou inativo.' });
        req.agent = agent;
        req.agentToken = token;
        next();
    } catch (err) {
        res.status(401).json({ success: false, error: 'Sessao invalida.' });
    }
}

function requireAdmin(req, res, next) {
    if (req.agent?.role !== 'admin') return res.status(403).json({ success: false, error: 'Somente administradores podem cadastrar agentes.' });
    next();
}

// --- ROTAS DE AUTENTICAÇÃO E QR CODE ---
router.get('/qr', qrController.getQrCodeJson);
router.get('/qr-image', qrController.getQrCodeImage);

router.post('/auth/login', async (req, res) => {
    try {
        const corporateEmail = (req.body.corporateEmail || '').trim().toLowerCase();
        const password = req.body.password || '';
        const agent = await Agent.findOne({ corporateEmail, active: true }).select('+passwordHash +passwordSalt');
        if (!agent || !verifyPassword(password, agent)) return res.status(401).json({ success: false, error: 'Usuario ou senha invalidos.' });
        const token = crypto.randomBytes(32).toString('hex');
        agentSessions.set(token, { agentId: agent._id.toString(), expiresAt: Date.now() + SESSION_DURATION_MS });
        res.json({ success: true, token, data: publicAgent(agent) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/auth/me', requireAgent, (req, res) => res.json({ success: true, data: publicAgent(req.agent) }));

router.post('/auth/logout', requireAgent, (req, res) => {
    agentSessions.delete(req.agentToken);
    res.json({ success: true });
});

router.patch('/auth/profile', requireAgent, async (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        const currentPassword = req.body.currentPassword || '';
        const newPassword = req.body.newPassword || '';
        if (!name || !currentPassword) return res.status(400).json({ success: false, error: 'Informe o nome e a senha atual.' });
        const agent = await Agent.findById(req.agent._id).select('+passwordHash +passwordSalt');
        if (!agent || !verifyPassword(currentPassword, agent)) return res.status(401).json({ success: false, error: 'Senha atual incorreta.' });
        if (newPassword && newPassword.length < 6) return res.status(400).json({ success: false, error: 'A nova senha deve ter pelo menos 6 caracteres.' });
        agent.name = name;
        if (newPassword) {
            agent.passwordSalt = crypto.randomBytes(16).toString('hex');
            agent.passwordHash = crypto.scryptSync(newPassword, agent.passwordSalt, 64).toString('hex');
        }
        await agent.save();
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

        if (!name || !corporateEmail || password.length < 6) {
            return res.status(400).json({ success: false, error: 'Preencha os campos e use uma senha com pelo menos 6 caracteres.' });
        }

        const passwordSalt = crypto.randomBytes(16).toString('hex');
        const passwordHash = crypto.scryptSync(password, passwordSalt, 64).toString('hex');
        const role = req.body.role === 'admin' ? 'admin' : 'agent';
        const agent = await Agent.create({ name, corporateEmail, passwordSalt, passwordHash, role });

        res.status(201).json({
            success: true,
            data: publicAgent(agent)
        });
    } catch (err) {
        if (err?.code === 11000) {
            return res.status(409).json({ success: false, error: 'Este email corporativo ja esta cadastrado.' });
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
            return res.status(400).json({ success: false, error: 'Voce nao pode bloquear sua propria conta.' });
        }

        const agent = await Agent.findByIdAndUpdate(req.params.agentId, { active }, { returnDocument: 'after' });
        if (!agent) return res.status(404).json({ success: false, error: 'Agente nao encontrado.' });

        if (!active) {
            for (const [token, session] of agentSessions.entries()) {
                if (session.agentId === agent._id.toString()) agentSessions.delete(token);
            }
        }
        res.json({ success: true, data: publicAgent(agent) });
    } catch (err) {
        res.status(400).json({ success: false, error: 'Nao foi possivel alterar o status do agente.' });
    }
});

// --- ROTA DE ENVIO EXTERNO (MANTÉM CHAVE DE API) ---
router.post('/send-message', checkApiKey, upload.single('file'), messageController.handleSendMessage);

// O painel usa a sessao autenticada; o agentId vem sempre do servidor.
router.post(
    '/panel/send-message',
    requireAgent,
    upload.single('file'),
    (req, res, next) => {
        req.body.agentId = req.agent._id.toString();
        next();
    },
    messageController.handleSendMessage
);

// --- NOVA ROTA: LISTAR CHATS, NOMES E GRUPOS ---
router.get('/whatsapp/chats', async (req, res) => {
    try {
        const chats = await whatsappService.getAllChats();
        res.json({ success: true, data: chats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/whatsapp/presence', requireAgent, async (req, res) => {
    const contactId = String(req.query.contactId || '');
    if (!contactId) return res.status(400).json({ success: false, error: 'Informe o contato.' });

    const data = await whatsappService.getContactPresence(contactId);
    res.json({ success: true, data });
});

router.post('/whatsapp/sync-history', requireAgent, async (req, res) => {
    try {
        const data = await whatsappService.syncRecentMessages();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- ROTAS DO PAINEL INTERNO ---

router.get('/tickets', async (req, res) => {
    try {
        const { status } = req.query; 
        const filter = status ? { status } : {};
        const tickets = await Ticket.find(filter).sort({ updatedAt: -1 });

        const genericGroupNames = new Set(['', 'Grupo', 'Grupo sem nome', 'Grupo do WhatsApp']);
        await Promise.all(tickets.map(async (ticket) => {
            const plainId = (ticket.phoneNumber || '').replace(/\D/g, '');
            const looksLikeGroupId = plainId.startsWith('120363') && plainId.length >= 17;
            const needsGroupRepair = ticket.isGroup
                ? genericGroupNames.has((ticket.contactName || '').trim())
                : looksLikeGroupId;

            if (!needsGroupRepair) return;

            const savedId = ticket.whatsappId || ticket.phoneNumber;
            const groupId = savedId.includes('@g.us')
                ? savedId
                : `${plainId}@g.us`;

            const metadata = await whatsappService.getChatMetadata(groupId);
            if (!metadata?.name) return;

            ticket.contactName = metadata.name;
            ticket.whatsappId = metadata.id || groupId;
            ticket.isGroup = true;
            if (metadata.profilePicUrl) ticket.profilePicUrl = metadata.profilePicUrl;
            await ticket.save();
        }));

        res.json({ success: true, data: tickets });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/tickets/:ticketId/messages', async (req, res) => {
    try {
        const messages = await Message.find({ ticketId: req.params.ticketId }).sort({ timestamp: 1 });
        res.json({ success: true, data: messages });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/messages/:messageId/media', async (req, res) => {
    try {
        const message = await Message.findById(req.params.messageId);
        if (!message?.hasMedia || !message.mediaPath) return res.status(404).end();

        const mediaDirectory = path.resolve(__dirname, '..', '..', '..', 'storage', 'media');
        const absolutePath = path.resolve(mediaDirectory, message.mediaPath);
        if (!absolutePath.startsWith(`${mediaDirectory}${path.sep}`)) return res.status(400).end();

        res.setHeader('Content-Type', message.mediaMimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(message.mediaFileName || 'arquivo')}"`);
        res.sendFile(absolutePath);
    } catch (err) {
        res.status(404).end();
    }
});

router.get('/tickets/:ticketId/profile-picture', async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.ticketId);
        if (!ticket) {
            return res.status(404).end();
        }

        const picture = await whatsappService.getProfilePicture(
            ticket.whatsappId || ticket.phoneNumber,
            ticket.isGroup,
            ticket.profilePicUrl
        );
        // Ausencia de foto e um estado normal; 204 evita tratar o avatar padrao como erro no frontend.
        if (!picture) return res.status(204).end();

        res.setHeader('Cache-Control', 'private, max-age=300');
        res.type(picture.contentType).send(picture.buffer);
    } catch (err) {
        res.status(404).end();
    }
});

router.post('/tickets/claim', requireAgent, async (req, res) => {
    try {
        const { ticketId } = req.body;
        const ticket = await Ticket.findByIdAndUpdate(
            ticketId,
            { assignedAgent: req.agent._id.toString(), status: 'open', updatedAt: new Date() },
            { returnDocument: 'after' }
        );

        if (!ticket) {
            return res.status(404).json({ success: false, error: 'Ticket não encontrado.' });
        }

        await whatsappService.recordTicketEvent(ticket, req.agent, 'claimed');
        res.json({ success: true, message: 'Atendimento assumido!', data: ticket });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/tickets/close', requireAgent, async (req, res) => {
    try {
        const { ticketId } = req.body;
        const ticket = await Ticket.findByIdAndUpdate(
            ticketId,
            { status: 'closed', updatedAt: new Date() },
            { returnDocument: 'after' }
        );

        if (!ticket) return res.status(404).json({ success: false, error: 'Ticket não encontrado.' });
        await whatsappService.recordTicketEvent(ticket, req.agent, 'closed');
        res.json({ success: true, message: 'Atendimento encerrado!', data: ticket });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/tickets/unclaim', requireAgent, async (req, res) => {
    try {
        const { ticketId } = req.body;
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({ success: false, error: 'Ticket não encontrado.' });
        }

        ticket.status = 'pending';
        ticket.assignedAgent = null;
        ticket.updatedAt = new Date();
        await ticket.save();

        await whatsappService.recordTicketEvent(ticket, req.agent, 'unclaimed');

        return res.status(200).json({ success: true, data: ticket });
    } catch (err) {
        console.error('Erro ao devolver ticket:', err);
        return res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
    }
});

// --- ROTA DE LIMPEZA DO BANCO DE DADOS ---
router.delete('/database/clear', async (req, res) => {
    try {
        await Ticket.deleteMany({});
        await Message.deleteMany({});
        res.json({ success: true, message: 'Banco de dados limpo com sucesso! Todos os tickets e mensagens foram removidos.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
