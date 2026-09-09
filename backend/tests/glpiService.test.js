const path = require('path');
const { createTicket, formatConversationHistory } = require('../src/services/glpiService');

describe('glpiService', () => {
    it('formata o histórico e escapa conteúdo HTML das mensagens', () => {
        const history = formatConversationHistory([
            { sender: 'agent', body: 'Poderia informar o erro?', timestamp: '2026-09-08T14:24:00.000Z' },
            { sender: 'client', body: '<script>erro</script>', timestamp: '2026-09-08T14:25:00.000Z' }
        ], 'Vicente');

        expect(history).toContain('-Poderia informar o erro? (11:24)');
        expect(history).toContain('-Vicente: &lt;script&gt;erro&lt;/script&gt; (11:25)');
        expect(history).not.toContain('-Agente:');
        expect(history).not.toContain('<script>');
    });
});

describe('upload de anexos do GLPI', () => {
    it('envia o documento por multipart e o vincula ao chamado criado', async () => {
        const originalFetch = global.fetch;
        const originalAppToken = process.env.SD_APP_TOKEN;
        const originalUserToken = process.env.SD_USER_TOKEN;
        process.env.SD_APP_TOKEN = 'app-token';
        process.env.SD_USER_TOKEN = 'user-token';
        const calls = [];
        global.fetch = vi.fn(async (url, options) => {
            calls.push({ url, options });
            const data = url.endsWith('/initSession') ? { session_token: 'session' }
                : url.endsWith('/Ticket/') ? { id: 321 }
                    : url.endsWith('/Document/') ? { id: 654 }
                        : {};
            return { ok: true, statusText: 'OK', json: async () => data };
        });

        try {
            const result = await createTicket({
                title: 'Teste',
                messages: [{ sender: 'client', body: 'Mensagem', timestamp: new Date() }],
                attachments: [{ filePath: path.join(__dirname, 'fixtures', 'anexo.txt'), fileName: 'anexo.txt', mimeType: 'text/plain' }]
            });
            expect(result.uploadedAttachments).toEqual([{ id: 654, fileName: 'anexo.txt' }]);
            expect(result.failedAttachments).toEqual([]);
            const upload = calls.find(call => call.url.endsWith('/Document/'));
            expect(upload.options.headers['Content-Type']).toMatch(/^multipart\/form-data; boundary=/);
            expect(upload.options.body.toString()).toContain('filename="anexo.txt"');
            const link = calls.find(call => call.url.endsWith('/Document_Item/'));
            expect(JSON.parse(link.options.body).input).toEqual({ documents_id: 654, itemtype: 'Ticket', items_id: 321 });
        } finally {
            global.fetch = originalFetch;
            if (originalAppToken === undefined) delete process.env.SD_APP_TOKEN; else process.env.SD_APP_TOKEN = originalAppToken;
            if (originalUserToken === undefined) delete process.env.SD_USER_TOKEN; else process.env.SD_USER_TOKEN = originalUserToken;
        }
    });
});
