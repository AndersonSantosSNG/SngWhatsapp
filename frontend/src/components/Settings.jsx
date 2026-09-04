import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function Settings({ agent, onAgentChange }) {
  const [agents, setAgents] = useState([]);
  const [apiClients, setApiClients] = useState([]);
  const [revealedKey, setRevealedKey] = useState('');
  const [feedback, setFeedback] = useState('');
  const adminAccess = agent.role === 'admin';
  const load = async () => {
    if (!adminAccess) return;
    const [agentsResult, clientsResult] = await Promise.all([api('/agents'), api('/api-clients')]);
    setAgents(agentsResult.data);
    setApiClients(clientsResult.data);
  };
  useEffect(() => { load().catch(console.error); }, [agent.role]);
  const profile = async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { const result = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify(Object.fromEntries(form)) }); onAgentChange(result.data); event.currentTarget.reset(); setFeedback('Perfil atualizado com sucesso.'); }
    catch (err) { setFeedback(err.message); }
  };
  const create = async event => {
    event.preventDefault(); const form = event.currentTarget;
    try { await api('/agents', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); form.reset(); setFeedback('Agente cadastrado com sucesso.'); await load(); }
    catch (err) { setFeedback(err.message); }
  };
  const changeStatus = async item => {
    try {
      await api(`/agents/${item._id}/status`, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) });
      setFeedback(item.active ? 'Agente bloqueado com sucesso.' : 'Agente reativado com sucesso.');
      await load();
    } catch (err) { setFeedback(err.message); }
  };
  const createApiClient = async event => {
    event.preventDefault(); const form = event.currentTarget;
    try {
      const result = await api('/api-clients', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      form.reset(); setRevealedKey(result.apiKey); setFeedback('Integração criada. Copie a chave agora.'); await load();
    } catch (err) { setFeedback(err.message); }
  };
  const changeApiClientStatus = async item => {
    try {
      await api(`/api-clients/${item._id}/status`, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) });
      setFeedback(item.active ? 'Integração bloqueada.' : 'Integração reativada.'); await load();
    } catch (err) { setFeedback(err.message); }
  };
  const rotateApiKey = async item => {
    try {
      const result = await api(`/api-clients/${item._id}/rotate`, { method: 'POST' });
      setRevealedKey(result.apiKey); setFeedback(`Nova chave gerada para ${item.name}. A chave anterior foi invalidada.`); await load();
    } catch (err) { setFeedback(err.message); }
  };
  const deleteApiClient = async item => {
    if (!window.confirm(`Excluir permanentemente a integração "${item.name}"? A chave deixará de funcionar imediatamente.`)) return;
    try {
      await api(`/api-clients/${item._id}`, { method: 'DELETE' });
      setFeedback('Integração e chave excluídas permanentemente.'); await load();
    } catch (err) { setFeedback(err.message); }
  };
  const copyApiKey = async () => {
    try { await navigator.clipboard.writeText(revealedKey); setFeedback('Chave copiada.'); }
    catch { setFeedback('Não foi possível copiar automaticamente. Selecione a chave abaixo.'); }
  };
  return <main className="page settings-page">
    <header><h1>Configurações</h1><p>Gerencie seu perfil, agentes e integrações autorizadas a usar a API.</p></header>
    <div className="settings-grid">
      <form className="card form-card" onSubmit={profile}><div className="form-heading"><h2>Meu perfil</h2><p>Altere seu nome ou defina uma nova senha.</p></div><label>Nome de usuário<input name="name" defaultValue={agent.name} required /></label><label>Senha atual<input name="currentPassword" type="password" required /></label><label>Nova senha (opcional)<input name="newPassword" type="password" minLength="6" placeholder="Mínimo de 6 caracteres" /></label><button className="submit-button"><i className="fa-solid fa-floppy-disk" />Salvar perfil</button></form>
      {adminAccess && <form className="card form-card" onSubmit={create}><div className="form-heading"><h2>Novo agente</h2><p>A senha é protegida antes de ser salva.</p></div><label>Nome do agente<input name="name" placeholder="Nome e Sobrenome" required /></label><label>E-mail corporativo<input name="corporateEmail" type="email" placeholder="nome@empresa.com.br" required /></label><label>Senha<input name="password" type="password" minLength="6" placeholder="Mínimo de 6 caracteres" required /></label><label>Perfil<select name="role"><option value="agent">Agente</option><option value="admin">Administrador</option></select></label><button className="submit-button"><i className="fa-solid fa-user-plus" />Cadastrar agente</button></form>}
      {adminAccess && <form className="card form-card" onSubmit={createApiClient}><div className="form-heading"><h2>Nova integração</h2><p>Crie uma chave exclusiva para cada site que utilizará a API.</p></div><label>Nome do site<input name="name" placeholder="Ex.: Audire" required /></label><label>URL permitida<input name="url" type="url" placeholder="https://www.audire.com.br" required /></label><button className="submit-button"><i className="fa-solid fa-key" />Gerar chave da API</button></form>}
    </div>
    {revealedKey && <section className="card api-key-result"><div><strong>Chave gerada</strong><small>Ela não será exibida novamente. Guarde-a em local seguro.</small></div><code>{revealedKey}</code><button type="button" onClick={copyApiKey}><i className="fa-solid fa-copy" />Copiar</button><button type="button" className="dismiss-key" onClick={() => setRevealedKey('')} aria-label="Ocultar chave"><i className="fa-solid fa-xmark" /></button></section>}
    {feedback && <p className="feedback">{feedback}</p>}
    {adminAccess && <section className="card agents-card"><div className="form-heading"><h2>Agentes cadastrados</h2><p>Lista visível somente para administradores desbloqueados.</p></div>{agents.map(item => <div className={`agent-row ${item.active ? '' : 'blocked'}`} key={item._id}><i className={`fa-solid ${item.active ? 'fa-user' : 'fa-user-lock'}`} /><span><strong>{item.name}</strong><small>{item.corporateEmail}</small></span><em>{item.active ? (item.role === 'admin' ? 'Administrador' : 'Agente') : 'Bloqueado'}</em><button type="button" className={item.active ? 'block-agent' : 'unblock-agent'} disabled={item._id === agent._id} onClick={() => changeStatus(item)} title={item._id === agent._id ? 'Voce nao pode bloquear sua propria conta' : undefined}><i className={`fa-solid ${item.active ? 'fa-ban' : 'fa-unlock'}`} />{item.active ? 'Bloquear' : 'Reativar'}</button></div>)}</section>}
    {adminAccess && <section className="card agents-card api-clients-card"><div className="form-heading"><h2>Integrações da API</h2><p>Cada chave só pode ser usada pelo site associado quando enviada pelo navegador.</p></div>{!apiClients.length && <p>Nenhuma integração cadastrada.</p>}{apiClients.map(item => <div className={`api-client-row ${item.active ? '' : 'blocked'}`} key={item._id}><i className="fa-solid fa-globe" /><span><strong>{item.name}</strong><small>{item.allowedOrigin}</small><code>{item.keyPrefix}</code></span><div className="api-client-usage"><em>{item.active ? 'Ativa' : 'Bloqueada'}</em><small>{item.lastUsedAt ? `Último uso: ${new Date(item.lastUsedAt).toLocaleString('pt-BR')}` : 'Nunca utilizada'}</small></div><button type="button" onClick={() => rotateApiKey(item)} title="Gerar uma nova chave"><i className="fa-solid fa-rotate" />Nova chave</button><button type="button" className={item.active ? 'block-agent' : 'unblock-agent'} onClick={() => changeApiClientStatus(item)}><i className={`fa-solid ${item.active ? 'fa-ban' : 'fa-unlock'}`} />{item.active ? 'Bloquear' : 'Reativar'}</button><button type="button" className="delete-api-client" onClick={() => deleteApiClient(item)} title="Excluir integração"><i className="fa-solid fa-trash" />Excluir</button></div>)}</section>}
  </main>;
}
