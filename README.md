# SNG Chat

Central de atendimento integrada ao WhatsApp, com frontend React/Vite, backend Node.js/Express, comunicação em tempo real por Socket.IO e persistência no MongoDB.

## Estrutura

```text
SngWhatsappAPI/
├── backend/          # API Express, MongoDB, Socket.IO e WhatsApp Web
├── frontend/         # Aplicação React/Vite
├── sessions/         # Sessão local do WhatsApp (gerada automaticamente)
├── storage/          # Mídias recebidas e enviadas
├── .env              # Configurações privadas locais
├── package.json      # Comandos executados na raiz
└── start.js          # Inicializa frontend e backend juntos
```

## Pré-requisitos

Instale na máquina:

- Node.js `20.19` ou superior. Também são suportadas versões a partir da `22.12`.
- npm, incluído na instalação do Node.js.
- Docker Desktop.
- Git, caso o projeto seja obtido de um repositório.

Confirme as instalações no PowerShell:

```powershell
node --version
npm --version
docker --version
docker compose version
```

Certifique-se de que o Docker Desktop esteja aberto antes de criar o MongoDB.

## 1. Obter o projeto

Clone o repositório ou copie a pasta do projeto para a máquina:

```powershell
git clone URL_DO_REPOSITORIO SngWhatsappAPI
Set-Location SngWhatsappAPI
```

Todos os comandos seguintes devem ser executados na raiz, onde estão `start.js`, `frontend/` e `backend/`.

## 2. Criar o MongoDB no Docker

Crie um volume persistente:

```powershell
docker volume create sng_mongodb_data
```

Crie o container. A porta fica acessível somente na própria máquina:

```powershell
docker run -d --name sng-mongodb --restart unless-stopped -p 127.0.0.1:27017:27017 -v sng_mongodb_data:/data/db mongo:7
```

Confirme se o container iniciou:

```powershell
docker ps --filter "name=sng-mongodb"
docker logs sng-mongodb
```

Comandos úteis:

```powershell
docker stop sng-mongodb
docker start sng-mongodb
docker restart sng-mongodb
```

O volume `sng_mongodb_data` mantém agentes, tickets e mensagens mesmo quando o container é reiniciado ou recriado.

## 3. Configurar o `.env`

Crie o arquivo `.env` na raiz do projeto:

```powershell
New-Item -ItemType File -Path .env -Force
```

Adicione:

```dotenv
API_SECRET_KEY=COLOQUE_UMA_CHAVE_ALEATORIA_AQUI
MONGODB_URI=mongodb://localhost:27017/sng_whatsapp
PORT=3000
# Quantidade de dias e limite de mensagens por conversa importadas do WhatsApp.
HISTORY_SYNC_DAYS=30
HISTORY_SYNC_LIMIT=1000
# Use false para importar apenas textos e ignorar arquivos antigos.
HISTORY_SYNC_MEDIA=true
```

Para gerar uma chave segura no PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToHexString($bytes).ToLower()
```

Copie o resultado para `API_SECRET_KEY`.

Essa chave é usada somente pela rota de integração externa `/api/send-message`. Ela nunca deve ser colocada no frontend, enviada ao Git ou compartilhada publicamente. O `.env` já está ignorado pelo Git.

## 4. Instalar as dependências

Instale separadamente as dependências do backend e frontend:

```powershell
npm install --prefix backend
npm install --prefix frontend
```

Não é necessário instalar dependências na raiz: o `start.js` usa apenas módulos nativos do Node.js.

## 5. Criar o primeiro administrador

Com o MongoDB em execução, rode:

```powershell
npm --prefix backend run create-admin
```

Informe nome, e-mail corporativo e uma senha de pelo menos seis caracteres. O comando pode ser usado novamente para atualizar a senha e garantir o perfil administrativo de um e-mail existente.

As senhas não são armazenadas em texto puro. Cada agente recebe um salt aleatório e o backend salva apenas o hash produzido com `scrypt`.

## 6. Iniciar em desenvolvimento

Na raiz do projeto:

```powershell
npm start
```

Esse comando inicia simultaneamente:

- Frontend React: <http://localhost:5173>
- Backend/API: <http://localhost:3000>

Abra <http://localhost:5173>, entre com o administrador criado e conecte o WhatsApp pela tela de Status e QR Code.

Para encerrar frontend e backend, pressione `Ctrl + C` no terminal.

### Iniciar separadamente

Backend:

```powershell
npm run start:backend
```

Frontend:

```powershell
npm run start:frontend
```

## 7. Gerar e executar o build de produção

Gere o frontend otimizado:

```powershell
npm run build
```

O resultado será salvo em `frontend/dist`. O backend Express serve esse diretório automaticamente.

Inicie somente o backend:

```powershell
npm run start:backend
```

Em produção, acesse:

```text
http://localhost:3000
```

Sempre execute `npm run build` novamente depois de alterar o frontend.

## Dados persistentes e backup

Os diretórios abaixo não devem ser apagados durante atualizações:

- `sessions/`: autenticação local do WhatsApp.
- `storage/`: imagens, documentos, áudios e vídeos das mensagens.
- Volume Docker `sng_mongodb_data`: banco MongoDB.

Backup do MongoDB:

```powershell
docker exec sng-mongodb mongodump --db sng_whatsapp --archive=/tmp/sng_whatsapp.archive
docker cp sng-mongodb:/tmp/sng_whatsapp.archive ./sng_whatsapp.archive
```

## Atualizar o projeto

Depois de obter uma nova versão do código:

```powershell
npm install --prefix backend
npm install --prefix frontend
npm run build
```

Reinicie o processo da aplicação.

## Solução de problemas

### `spawn EINVAL`

Certifique-se de estar usando o `start.js` atual e uma versão compatível do Node.js:

```powershell
node --version
node --check start.js
```

### MongoDB não conecta

Confira o container e a porta:

```powershell
docker ps --filter "name=sng-mongodb"
Test-NetConnection localhost -Port 27017
```

Confirme também:

```dotenv
MONGODB_URI=mongodb://localhost:27017/sng_whatsapp
```

### Porta ocupada

Consulte o processo que está usando uma porta:

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
```

### QR Code não aparece

- Aguarde o backend concluir a inicialização do WhatsApp Web.
- Abra a aba `Status & QR Code`.
- Verifique os logs do backend.
- Se uma sessão válida já existir, o QR Code não será exibido.

### Alterações do frontend não aparecem

Em desenvolvimento, abra <http://localhost:5173>. Em produção, gere novamente o build:

```powershell
npm run build
```

Depois use `Ctrl + F5` no navegador.

## Segurança

- Nunca envie `.env`, `sessions/` ou mídias privadas para o Git.
- Não coloque `API_SECRET_KEY` em variáveis `VITE_*` ou no código React.
- O painel usa a sessão autenticada do agente; a chave da API é reservada às integrações externas.
- Use HTTPS e um proxy reverso quando publicar o sistema na internet.
- Restrinja o acesso às portas `27017`, `3000` e `5173` conforme o ambiente.
