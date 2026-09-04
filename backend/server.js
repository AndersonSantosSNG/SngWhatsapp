const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const AgentSession = require('./src/models/AgentSession');
const Agent = require('./src/models/Agent');

// Importação da Conexão com o MongoDB
const connectDB = require('./src/config/database');

const apiRoutes = require('./src/routes/apiRoutes');
const { initWhatsApp, destroyClient, getStatus } = require('./src/services/whatsappService');

// Inicializa a conexão com o Banco de Dados
connectDB();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ['GET', 'POST'] }
});

// Middlewares
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: '10mb' }));
const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendPath));

// Rotas
app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

io.use(async (socket, next) => {
    try {
        const cookieToken = String(socket.handshake.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('agent_session='))?.split('=').slice(1).join('=');
        const token = String(socket.handshake.auth?.token || '') || decodeURIComponent(cookieToken || '');
        if (!token) return next(new Error('Sessão ausente.'));
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const session = await AgentSession.findOne({ tokenHash, expiresAt: { $gt: new Date() } });
        if (!session) return next(new Error('Sessão expirada.'));
        const agent = await Agent.findOne({ _id: session.agentId, active: true });
        if (!agent) return next(new Error('Agente inativo.'));
        socket.agentId = agent._id.toString();
        next();
    } catch (err) {
        next(new Error('Sessão inválida.'));
    }
});

app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
}, apiRoutes);

// WebSocket
io.on('connection', (socket) => {
    console.log('Cliente conectado ao WebSocket:', socket.id);
    const { isClientReady, currentQrCode } = getStatus();
    if (!isClientReady && currentQrCode) {
        socket.emit('qr_code', { qr: currentQrCode });
    }
});

// Inicialização do WhatsApp Service com Socket.io
initWhatsApp(io);

// Tratamento de Erros e Graceful Shutdown
process.on('unhandledRejection', (err) => console.error('⚠️ Unhandled Rejection:', err));
process.on('uncaughtException', (err) => console.error('⚠️ Uncaught Exception:', err));

const handleExit = async () => {
    console.log('🛑 Fechando sessão do WhatsApp com segurança...');
    await destroyClient();
    process.exit(0);
};

process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);

// Inicialização do Servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor Node.js rodando na porta ${PORT}`);
});
