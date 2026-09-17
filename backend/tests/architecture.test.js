const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Chat = require('../src/models/Chat');
const { listTickets, decodeCursor } = require('../src/services/ticketService');
const { looksDangerous, validateUploadedFile } = require('../src/services/fileValidation');
const { normalizeKey } = require('../src/services/messageService');

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(() => Chat.deleteMany({}));

describe('paginacao de tickets', () => {
  it('pagina por cursor sem repetir conversas', async () => {
    await Chat.insertMany(
      Array.from({ length: 5 }, (_, index) => ({
        phoneNumber: `551100000000${index}`,
        lastMessageAt: new Date(Date.now() - index * 1000),
      })),
    );
    const first = await listTickets({ limit: 2 });
    const second = await listTickets({ limit: 2, cursor: first.meta.nextCursor });
    expect(first.data).toHaveLength(2);
    expect(second.data).toHaveLength(2);
    expect(first.data.map((chat) => String(chat._id))).not.toContain(String(second.data[0]._id));
    expect(decodeCursor(first.meta.nextCursor)).toBeTruthy();
  });

  it('rejeita cursor malformado', async () => {
    await expect(listTickets({ cursor: 'invalido' })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('seguranca de upload e idempotencia', () => {
  it('detecta executavel e HTML mesmo com MIME benigno', () => {
    expect(looksDangerous(Buffer.from('MZfake'))).toBe(true);
    expect(() =>
      validateUploadedFile({ mimetype: 'image/png', buffer: Buffer.from('<html>ataque</html>') }),
    ).toThrow(/conteudo real/i);
  });

  it('aceita arquivo comum e valida a chave de idempotencia', () => {
    expect(() =>
      validateUploadedFile({ mimetype: 'text/plain', buffer: Buffer.from('documento') }),
    ).not.toThrow();
    expect(normalizeKey('cliente:pedido-123')).toBe('cliente:pedido-123');
    expect(() => normalizeKey('chave com espaco')).toThrow(/idempotencia/i);
  });
});
