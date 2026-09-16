import { useState } from 'react';
import logo from '../assets/logo.png';

const Code = ({ children }) => <pre><code>{children}</code></pre>;

export default function DocsPage() {
  const [section, setSection] = useState('app');
  return <div className="docs-page">
    <header className="docs-topbar"><a href="/" className="docs-brand"><img src={logo} alt="SNG" /><span><strong>SNG Chat</strong><small>Central de documentação</small></span></a><a href="/" className="docs-back"><i className="fa-solid fa-arrow-left" />Voltar ao sistema</a></header>
    <div className="docs-layout">
      <aside className="docs-nav"><p>Documentação</p><button className={section === 'app' ? 'active' : ''} onClick={() => setSection('app')}><i className="fa-solid fa-book-open" /><span>Uso do aplicativo</span></button><button className={section === 'api' ? 'active' : ''} onClick={() => setSection('api')}><i className="fa-solid fa-code" /><span>API para devs</span></button><div className="docs-nav-note"><i className="fa-solid fa-circle-info" /><span>Use sempre HTTPS em produção e nunca exponha uma chave de API no código público.</span></div></aside>
      <main className="docs-content">
        {section === 'app' ? <>
          <div className="docs-hero"><span className="docs-kicker">Manual operacional</span><h1>Como usar o SNG Chat</h1><p>Guia rápido para conectar o WhatsApp, organizar conversas e registrar atendimentos com segurança.</p></div>
          <section id="primeiro-acesso"><h2><span>1</span> Primeiro acesso e conexão</h2><ol><li>Entre com seu e-mail corporativo e senha.</li><li>Abra <strong>Status &amp; QR Code</strong> no menu lateral.</li><li>No celular, acesse <strong>WhatsApp → Aparelhos conectados → Conectar um aparelho</strong>.</li><li>Leia o QR Code e aguarde o indicador mostrar <strong>Servidor conectado</strong>.</li></ol><div className="docs-callout warning"><i className="fa-solid fa-triangle-exclamation" /><p>Não compartilhe o QR Code. Ele concede acesso à conta do WhatsApp.</p></div></section>
          <section><h2><span>2</span> Atender uma conversa</h2><ol><li>Abra <strong>Atendimentos</strong> e selecione uma conversa pendente.</li><li>Clique em <strong>Assumir</strong>. O sistema registra quem iniciou o atendimento.</li><li>Envie texto, documentos, imagens, vídeos ou áudio. Use <strong>Citar</strong> para responder uma mensagem específica.</li><li>Ao terminar, clique em <strong>Encerrar</strong>. Se necessário, você pode devolver a conversa à fila.</li></ol></section>
          <section><h2><span>3</span> Mensagens e chamadas</h2><div className="docs-grid"><article><i className="fa-solid fa-check-double" /><h3>Status da mensagem</h3><p>Os ícones indicam envio, entrega, leitura ou falha. Mensagens próprias podem ser editadas ou apagadas dentro do prazo permitido pelo WhatsApp.</p></article><article><i className="fa-solid fa-phone-slash" /><h3>Chamadas recebidas</h3><p>Chamadas de voz ou vídeo aparecem como evento no histórico e fazem a conversa retornar para a fila quando necessário.</p></article><article><i className="fa-solid fa-paperclip" /><h3>Arquivos</h3><p>Anexe arquivos pelo clipe. Mídias recebidas ficam disponíveis diretamente no histórico da conversa.</p></article><article><i className="fa-solid fa-ticket" /><h3>Chamado GLPI</h3><p>Selecione as mensagens relevantes, informe um título e escolha quais anexos devem acompanhar o chamado.</p></article></div></section>
          <section><h2><span>4</span> Administração e auditoria</h2><p>Em <strong>Configurações</strong>, administradores cadastram agentes, controlam integrações e consultam a auditoria. Cada ação registra responsável, horário, rota, resultado e identificador da requisição. Senhas, tokens, chaves e conteúdo das mensagens são ocultados.</p></section>
          <section><h2><span>5</span> Boas práticas</h2><ul><li>Use uma conta individual; não compartilhe credenciais entre agentes.</li><li>Assuma a conversa antes de responder e encerre o atendimento ao concluir.</li><li>Não envie dados sensíveis sem necessidade.</li><li>Em caso de desconexão, verifique o status antes de tentar reconectar o WhatsApp.</li></ul></section>
        </> : <>
          <div className="docs-hero"><span className="docs-kicker">Referência técnica</span><h1>API para desenvolvedores</h1><p>Integre sistemas externos ao envio de mensagens do SNG Chat.</p></div>
          <section><h2>Visão geral</h2><div className="endpoint"><span>POST</span><code>/api/send-message</code></div><p>A API utiliza HTTPS e autenticação pelo cabeçalho <code>X-API-Key</code>. Um administrador cria e gerencia as credenciais em <strong>Configurações → Nova integração</strong>. A chave completa é mostrada apenas na criação ou rotação.</p><div className="docs-callout"><i className="fa-solid fa-shield-halved" /><p>Guarde a chave somente no backend ou em um cofre de segredos. Chamadas feitas diretamente pelo navegador também precisam partir da origem cadastrada.</p></div></section>
          <section><h2>Enviar texto</h2><Code>{`curl -X POST "https://seu-dominio.com/api/send-message" \\
  -H "X-API-Key: sng_SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "number": "5511999999999",
    "message": "Olá! Sua solicitação foi recebida."
  }'`}</Code><h3>Exemplo com JavaScript</h3><Code>{`const response = await fetch("https://seu-dominio.com/api/send-message", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": process.env.SNG_API_KEY
  },
  body: JSON.stringify({
    number: "5511999999999",
    message: "Olá! Sua solicitação foi recebida."
  })
});

if (!response.ok) throw new Error(await response.text());
const result = await response.json();`}</Code></section>
          <section><h2>Campos da requisição</h2><div className="docs-table-wrap"><table><thead><tr><th>Campo</th><th>Tipo</th><th>Obrigatório</th><th>Descrição</th></tr></thead><tbody><tr><td><code>number</code></td><td>string</td><td>Sim</td><td>Número com país e DDD, somente dígitos. Ex.: <code>5511999999999</code>.</td></tr><tr><td><code>message</code></td><td>string</td><td>Condicional</td><td>Texto ou legenda. Obrigatório quando nenhum arquivo for enviado.</td></tr><tr><td><code>fileBase64</code></td><td>string</td><td>Não</td><td>Conteúdo do arquivo em Base64, sem o prefixo Data URL.</td></tr><tr><td><code>mimeType</code></td><td>string</td><td>Com arquivo</td><td>Tipo MIME, como <code>application/pdf</code> ou <code>image/png</code>.</td></tr><tr><td><code>fileName</code></td><td>string</td><td>Não</td><td>Nome apresentado ao destinatário.</td></tr><tr><td><code>fileUrl</code></td><td>string</td><td>Não</td><td>URL pública de um arquivo. Não use junto com <code>fileBase64</code>.</td></tr><tr><td><code>sendAudioAsVoice</code></td><td>boolean</td><td>Não</td><td>Envia um arquivo de áudio como mensagem de voz.</td></tr><tr><td><code>replyToMessageId</code></td><td>string</td><td>Não</td><td>ID da mensagem existente que será citada na resposta.</td></tr><tr><td><code>isClosingMessage</code></td><td>boolean</td><td>Não</td><td>Indica que o envio faz parte do encerramento do atendimento.</td></tr></tbody></table></div></section>
          <section><h2>Enviar arquivo com multipart</h2><Code>{`curl -X POST "https://seu-dominio.com/api/send-message" \\
  -H "X-API-Key: sng_SUA_CHAVE" \\
  -F "number=5511999999999" \\
  -F "message=Segue o documento" \\
  -F "file=@documento.pdf"`}</Code></section>
          <section><h2>Respostas e erros</h2><h3>Solicitação aceita</h3><Code>{`{
  "status": "success",
  "message": "Mensagem adicionada à fila de envio com sucesso."
}`}</Code><div className="docs-table-wrap"><table><thead><tr><th>Status</th><th>Significado</th></tr></thead><tbody><tr><td><code>200</code></td><td>Mensagem aceita para processamento.</td></tr><tr><td><code>400</code></td><td>Número, texto ou arquivo ausente/inválido.</td></tr><tr><td><code>401</code></td><td>Chave ausente, inválida ou bloqueada.</td></tr><tr><td><code>403</code></td><td>Origem do navegador não autorizada.</td></tr><tr><td><code>500</code></td><td>Falha durante o processamento.</td></tr><tr><td><code>503</code></td><td>WhatsApp ainda não está conectado.</td></tr></tbody></table></div><p>Aceite HTTP confirma que a solicitação entrou na fila; acompanhe o status final pelo painel. Todas as chamadas ficam registradas na auditoria, sem armazenar a chave ou o conteúdo da mensagem no log.</p></section>
        </>}
        <footer className="docs-footer">SNG Chat · Documentação do aplicativo e API</footer>
      </main>
    </div>
  </div>;
}
