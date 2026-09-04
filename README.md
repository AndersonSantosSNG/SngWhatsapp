# SNG Chat

Central de atendimento integrada ao WhatsApp, com painel React/Vite, API Node.js/Express, Socket.IO e MongoDB.

## Recursos

- Envio e recebimento de textos e arquivos.
- Atendimentos pendentes, assumidos e encerrados, com eventos internos de auditoria.
- Respostas com citação, confirmações de leitura e presença online.
- Pesquisa, filtros, histórico paginado e sincronização de mensagens antigas.
- Agentes autenticados, administração protegida e chaves individuais de integração.
- Interface responsiva, aplicativo Android e testes automatizados.

## Estrutura

```text
SngWhatsapp/
├── backend/              API, Socket.IO, MongoDB e WhatsApp Web
├── frontend/             React/Vite e projeto Android
├── sessions/             sessão local do WhatsApp (gerada em execução)
├── storage/              mídias recebidas e enviadas
├── .github/workflows/    testes automáticos
├── .env.example          modelo de configuração
├── package.json          comandos gerais
└── start.js              inicialização de desenvolvimento
```

## Pré-requisitos

- Node.js 24 LTS (mínimo: `20.19` ou `22.12`).
- npm, Git e MongoDB 7.
- Docker Desktop no Windows ou Docker Engine no Linux, caso use o MongoDB deste guia.

> O Docker abaixo executa somente o MongoDB. A aplicação Node.js roda diretamente no sistema.

## Instalação no Windows

Use o PowerShell.

### 1. Obter o projeto e validar os programas

Instale Git, Node.js 24 LTS e Docker Desktop. Abra o Docker Desktop e execute:

```powershell
git --version
node --version
npm --version
docker --version
git clone URL_DO_REPOSITORIO SngWhatsapp
Set-Location SngWhatsapp
```

Se o projeto já estiver na máquina, apenas abra sua pasta no PowerShell.

### 2. Criar o MongoDB

```powershell
docker volume create sng_mongodb_data
docker run -d --name sng-mongodb --restart unless-stopped -p 127.0.0.1:27017:27017 -v sng_mongodb_data:/data/db mongo:7
docker ps --filter "name=sng-mongodb"
```

Nas próximas inicializações, basta usar `docker start sng-mongodb`.

### 3. Configurar e instalar

```powershell
Copy-Item .env.example .env
$keyBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($keyBytes)
[Convert]::ToHexString($keyBytes).ToLower()
```

Copie o valor gerado para `API_SECRET_KEY` no `.env`. Depois:

```powershell
npm ci --prefix backend
npm ci --prefix frontend
npm test
npm run build
```

Use `npm install` no lugar de `npm ci` apenas ao alterar dependências.

### 4. Criar o administrador e iniciar

```powershell
npm --prefix backend run create-admin
npm start
```

Em desenvolvimento, abra <http://localhost:5173>. Para executar o build de produção:

```powershell
npm run build
npm run start:backend
```

Nesse modo, abra <http://localhost:3000>.

## Instalação no Linux

Os comandos de pacotes abaixo são para Ubuntu/Debian.

### 1. Obter o projeto e validar os programas

Instale Git, Docker Engine e Node.js 24 LTS pelo repositório da distribuição ou por um gerenciador como `nvm`.

```bash
git --version
node --version
npm --version
docker --version
sudo systemctl enable --now docker
git clone URL_DO_REPOSITORIO SngWhatsapp
cd SngWhatsapp
```

Use `sudo` nos comandos Docker se seu usuário não pertencer ao grupo `docker`.

### 2. Criar o MongoDB

```bash
docker volume create sng_mongodb_data
docker run -d --name sng-mongodb --restart unless-stopped -p 127.0.0.1:27017:27017 -v sng_mongodb_data:/data/db mongo:7
docker ps --filter name=sng-mongodb
```

Nas próximas inicializações, use `docker start sng-mongodb`.

### 3. Configurar o ambiente

```bash
cp .env.example .env
openssl rand -hex 32
```

Copie o resultado para `API_SECRET_KEY` no `.env`.

### 4. Instalar as bibliotecas do Chromium

O WhatsApp Web utiliza Chromium. Em uma instalação mínima do Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates fonts-liberation libasound2t64 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 xdg-utils
```

Em versões antigas, o pacote pode se chamar `libasound2` em vez de `libasound2t64`.

### 5. Instalar, testar e iniciar

```bash
npm ci --prefix backend
npm ci --prefix frontend
npm test
npm run build
npm --prefix backend run create-admin
NODE_ENV=production npm run start:backend
```

Para criar o administrador sem perguntas:

```bash
ADMIN_NAME="Administrador" ADMIN_EMAIL="admin@empresa.com" ADMIN_PASSWORD="SENHA_SEGURA" npm --prefix backend run create-admin
```

O painel ficará em `http://IP_DO_SERVIDOR:3000`. Em servidor público, use HTTPS com Nginx, Caddy ou outro proxy reverso.

## Configuração do `.env`

| Variável | Obrigatória | Padrão | Descrição |
|---|---:|---:|---|
| `API_SECRET_KEY` | Sim | — | Chave mestre legada da API externa; nunca deve ir para o frontend. |
| `MONGODB_URI` | Sim | — | Endereço do MongoDB. |
| `PORT` | Não | `3000` | Porta do backend e do painel em produção. |
| `NODE_ENV` | Não | — | Use `production` no servidor HTTPS para cookies seguros. |
| `HISTORY_SYNC_DAYS` | Não | `30` | Dias buscados na sincronização do histórico. |
| `HISTORY_SYNC_LIMIT` | Não | `1000` | Máximo de mensagens importadas por conversa. |
| `HISTORY_SYNC_MEDIA` | Não | `true` | Use `false` para ignorar mídias antigas. |

`ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` são opcionais e usados apenas na criação não interativa do administrador.

## Primeiro acesso

1. Entre no painel com o administrador criado.
2. Abra **Status & QR Code**.
3. No celular, acesse **WhatsApp > Aparelhos conectados > Conectar um aparelho**.
4. Leia o QR Code e aguarde a conexão.

A autenticação fica em `sessions/`; preserve essa pasta para evitar um novo QR Code a cada reinício.

## Testes

```bash
npm test
npm run test:backend
npm run test:frontend
```

Modo contínuo durante o desenvolvimento:

```bash
npm --prefix backend run test:watch
npm --prefix frontend run test:watch
```

Os testes de backend usam um MongoDB temporário e não alteram o banco do `.env`. O workflow `.github/workflows/tests.yml` executa testes e build em cada `push` e `pull request`.

## API para integrações

Administradores criam credenciais em **Configurações > Nova integração**, informando nome e origem autorizada, como `https://loja.exemplo.com.br`. A chave só aparece integralmente na criação ou rotação:

```http
POST /api/send-message
Content-Type: application/json
X-API-Key: sng_CHAVE_GERADA

{
  "number": "5511999999999",
  "message": "Olá!"
}
```

- Chaves de integração não concedem acesso administrativo.
- Funções administrativas exigem a sessão de um agente administrador.
- Requisições de navegador têm a origem comparada à URL cadastrada.
- A chave do `.env` continua aceita na API externa para compatibilidade.
- Exclua ou rotacione imediatamente uma chave comprometida.

## Dados e backup

Preserve `sessions/`, `storage/` e o volume `sng_mongodb_data` durante atualizações.

Backup:

```bash
docker exec sng-mongodb mongodump --db sng_whatsapp --archive=/tmp/sng_whatsapp.archive
docker cp sng-mongodb:/tmp/sng_whatsapp.archive ./sng_whatsapp.archive
```

Restauração:

```bash
docker cp ./sng_whatsapp.archive sng-mongodb:/tmp/sng_whatsapp.archive
docker exec sng-mongodb mongorestore --archive=/tmp/sng_whatsapp.archive --drop
```

`--drop` substitui as coleções atuais. Faça um backup antes de restaurar.

## Atualização

```bash
git pull
npm ci --prefix backend
npm ci --prefix frontend
npm test
npm run build
```

Depois, reinicie o processo do backend.

## Solução de problemas

### MongoDB não conecta

```bash
docker ps --filter name=sng-mongodb
docker logs sng-mongodb
```

Confirme `MONGODB_URI=mongodb://127.0.0.1:27017/sng_whatsapp`. No Windows, teste com `Test-NetConnection 127.0.0.1 -Port 27017`; no Linux, use `ss -ltn | grep 27017`.

### Porta ocupada

Windows:

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
```

Linux:

```bash
ss -ltnp | grep -E ':3000|:5173'
```

### QR Code não aparece

- Aguarde o WhatsApp Web inicializar e confira os logs.
- Verifique a conexão com a internet.
- Uma sessão válida em `sessions/` dispensa novo QR Code.

### Chromium não inicia no Linux

Instale as bibliotecas indicadas acima e verifique memória, permissões de `sessions/` e `storage/` e os logs completos do backend.

### Frontend desatualizado em produção

Execute `npm run build`, reinicie o backend e atualize o navegador ignorando o cache.

## Segurança de produção

- Nunca envie `.env`, `sessions/`, backups ou mídias privadas para o Git.
- Nunca coloque segredos em variáveis `VITE_*` ou no React.
- Publique somente por HTTPS e não exponha a porta `27017`.
- Restrinja o firewall, remova agentes antigos e revogue chaves sem uso.
- Mantenha backups criptografados e teste sua restauração.
- Execute `npm test` e `npm run build` antes de publicar.
