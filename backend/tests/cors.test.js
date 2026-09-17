const ApiClient = require('../src/models/ApiClient');
const { classifyOrigin, normalizeOrigin, socketCorsOrigin } = require('../src/config/cors');

describe('política de CORS', () => {
  afterEach(() => vi.restoreAllMocks());

  it('normaliza e autoriza a origem oficial do painel', async () => {
    expect(normalizeOrigin('https://whatsapp.sng.com.br/')).toBe('https://whatsapp.sng.com.br');
    await expect(classifyOrigin('https://whatsapp.sng.com.br')).resolves.toBe('panel');
  });

  it('autoriza origens ativas cadastradas nas chaves de API', async () => {
    vi.spyOn(ApiClient, 'exists').mockResolvedValue({ _id: 'client' });
    await expect(classifyOrigin('https://integracao.exemplo.com')).resolves.toBe('api-client');
  });

  it('rejeita origens desconhecidas no HTTP e no WebSocket', async () => {
    vi.spyOn(ApiClient, 'exists').mockResolvedValue(null);
    await expect(classifyOrigin('https://malicioso.exemplo')).resolves.toBe('');
    const callback = vi.fn();
    socketCorsOrigin('https://malicioso.exemplo', callback);
    expect(callback).toHaveBeenCalledWith(expect.any(Error), false);
  });
});
