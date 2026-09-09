const DEFAULT_GLPI_URL = 'https://atendimento.sng.com.br/apirest.php';
const fs = require('fs/promises');
const path = require('path');

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatConversationHistory(messages, contactName = 'Usuário') {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const lines = messages.map(message => {
        const body = message.body || (message.hasMedia ? '[Mídia/Arquivo]' : '[Mensagem sem texto]');
        const escapedBody = escapeHtml(body);
        const content = message.sender === 'agent'
            ? escapedBody
            : `${escapeHtml(message.groupSenderName || contactName || 'Usuário')}: ${escapedBody}`;
        return `-${content} (${formatter.format(new Date(message.timestamp))})`;
    });
    return `Histórico conversa WhatsApp:<br><br>${lines.join('<br>')}`;
}

async function glpiRequest(path, options = {}) {
    const appToken = process.env.SD_APP_TOKEN;
    const userToken = process.env.SD_USER_TOKEN;
    if (!appToken || !userToken) throw new Error('Integração com o GLPI não configurada. Informe SD_APP_TOKEN e SD_USER_TOKEN.');

    const response = await fetch(`${(process.env.GLPI_URL || DEFAULT_GLPI_URL).replace(/\/$/, '')}${path}`, {
        ...options,
        headers: {
            ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
            'App-Token': appToken,
            ...options.headers
        }
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const details = Array.isArray(data) ? data.join(' - ') : data?.message || data?.error || response.statusText;
        throw new Error(`GLPI: ${details || 'não foi possível concluir a solicitação.'}`);
    }
    return data;
}

async function uploadAttachment(sessionToken, ticketId, attachment) {
    const fileName = path.basename(attachment.fileName || attachment.filePath).replace(/["\r\n]/g, '_');
    const maxBytes = Math.max(1, Number.parseInt(process.env.GLPI_MAX_ATTACHMENT_MB || '25', 10)) * 1024 * 1024;
    const stats = await fs.stat(attachment.filePath);
    if (stats.size > maxBytes) throw new Error(`${fileName} excede o limite local de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    const buffer = await fs.readFile(attachment.filePath);
    const boundary = `----SngGlpi${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    const manifest = JSON.stringify({ input: { name: fileName, _filename: [fileName] } });
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="uploadManifest"\r\nContent-Type: application/json\r\n\r\n${manifest}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="filename[0]"; filename="${fileName}"\r\nContent-Type: ${attachment.mimeType || 'application/octet-stream'}\r\n\r\n`),
        buffer,
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    const document = await glpiRequest('/Document/', {
        method: 'POST',
        headers: { 'Session-Token': sessionToken, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body
    });
    if (!document?.id) throw new Error(`GLPI não retornou o documento criado para ${fileName}.`);
    await glpiRequest('/Document_Item/', {
        method: 'POST',
        headers: { 'Session-Token': sessionToken },
        body: JSON.stringify({ input: { documents_id: document.id, itemtype: 'Ticket', items_id: ticketId } })
    });
    return { id: document.id, fileName };
}

async function createTicket({ title, messages, contactName, attachments = [] }) {
    let sessionToken;
    try {
        const session = await glpiRequest('/initSession', {
            headers: { Authorization: `user_token ${process.env.SD_USER_TOKEN}` }
        });
        sessionToken = session.session_token;
        if (!sessionToken) throw new Error('GLPI não retornou um token de sessão.');

        const result = await glpiRequest('/Ticket/', {
            method: 'POST',
            headers: { 'Session-Token': sessionToken },
            body: JSON.stringify({
                input: { name: title, content: formatConversationHistory(messages, contactName), urgency: 3, type: 1 }
            })
        });
        if (!result?.id) throw new Error('GLPI criou o chamado, mas não retornou o número.');
        const uploadedAttachments = [];
        const failedAttachments = [];
        for (const attachment of attachments) {
            try {
                uploadedAttachments.push(await uploadAttachment(sessionToken, result.id, attachment));
            } catch (err) {
                failedAttachments.push({ fileName: path.basename(attachment.fileName || attachment.filePath), error: err.message });
            }
        }
        return { ...result, uploadedAttachments, failedAttachments };
    } finally {
        if (sessionToken) {
            await glpiRequest('/killSession', { headers: { 'Session-Token': sessionToken } })
                .catch(err => console.error('[GLPI][ENCERRAR SESSÃO]', err.message));
        }
    }
}

function ticketUrl(ticketId) {
    const apiUrl = (process.env.GLPI_URL || DEFAULT_GLPI_URL).replace(/\/$/, '');
    const baseUrl = apiUrl.replace(/\/apirest\.php$/i, '');
    return `${baseUrl}/front/ticket.form.php?id=${encodeURIComponent(ticketId)}`;
}

module.exports = { createTicket, formatConversationHistory, ticketUrl };
