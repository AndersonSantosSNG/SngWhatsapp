const nodemailer = require('nodemailer');

function smtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER || '').trim();
  const password = String(process.env.SMTP_PASSWORD || '');
  const from = String(process.env.SMTP_FROM || user).trim();
  if (!host || !port || !user || !password || !from) {
    throw new Error('Servidor SMTP nao configurado.');
  }
  return { host, port, user, password, from };
}

async function sendPasswordResetCode(recipient, name, code) {
  if (process.env.NODE_ENV === 'test') return;
  const config = smtpConfig();
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    requireTLS: String(process.env.SMTP_REQUIRE_TLS || '').toLowerCase() === 'true',
    auth: { user: config.user, pass: config.password },
  });
  await transport.sendMail({
    from: config.from,
    to: recipient,
    subject: 'Seu código de recuperação - SNG WhatsApp',
    text: `Ola, ${name}. Seu codigo para redefinir a senha e ${code}. Ele expira em 30 minutos. Se voce nao solicitou a alteracao, ignore este e-mail.`,
    html: `<!doctype html>
      <html lang="pt-BR">
        <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 16px">
            <tr><td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.10)">
                <tr><td style="padding:28px 32px;background:#0f172a;text-align:center">
                  <div style="font-size:26px;font-weight:700;color:#ffffff">SNG WhatsApp</div>
                  <div style="margin-top:6px;font-size:13px;color:#94a3b8">Recuperação segura de acesso</div>
                </td></tr>
                <tr><td style="padding:32px">
                  <h1 style="margin:0 0 14px;font-size:22px;color:#0f172a">Olá, ${name}!</h1>
                  <p style="margin:0;color:#475569;font-size:15px;line-height:1.6">Recebemos uma solicitação para redefinir sua senha. Use o código abaixo para confirmar sua identidade:</p>
                  <div style="margin:28px 0;padding:20px;border:1px solid #a7f3d0;border-radius:12px;background:#ecfdf5;text-align:center">
                    <div style="margin-bottom:8px;color:#047857;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Código de verificação</div>
                    <div style="color:#064e3b;font-size:34px;font-weight:800;letter-spacing:9px">${code}</div>
                  </div>
                  <p style="margin:0;color:#475569;font-size:14px;line-height:1.6"><strong>Validade:</strong> 30 minutos. Após três tentativas incorretas, o código será bloqueado.</p>
                  <div style="margin-top:24px;padding:14px;border-radius:10px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.5">Se você não solicitou esta alteração, ignore este e-mail. Sua senha permanecerá a mesma.</div>
                </td></tr>
                <tr><td style="padding:18px 32px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px">Mensagem automática. Não responda a este e-mail.</td></tr>
              </table>
            </td></tr>
          </table>
        </body>
      </html>`,
  });
}

module.exports = { sendPasswordResetCode };
