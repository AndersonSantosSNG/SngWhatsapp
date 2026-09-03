import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function Settings({ agent, onAgentChange }) {
  const [agents, setAgents] = useState([]);
  const [feedback, setFeedback] = useState('');
  const load = async () => { if (agent.role === 'admin') setAgents((await api('/agents')).data); };
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
  return <main className="page settings-page">
    <header><h1>Configurações</h1><p>Gerencie seu perfil e, se for administrador, cadastre novos agentes.</p></header>
    <div className="settings-grid">
      <form className="card form-card" onSubmit={profile}><div className="form-heading"><h2>Meu perfil</h2><p>Altere seu nome ou defina uma nova senha.</p></div><label>Nome de usuário<input name="name" defaultValue={agent.name} required /></label><label>Senha atual<input name="currentPassword" type="password" required /></label><label>Nova senha (opcional)<input name="newPassword" type="password" minLength="6" placeholder="Mínimo de 6 caracteres" /></label><button className="submit-button"><i className="fa-solid fa-floppy-disk" />Salvar perfil</button></form>
      {agent.role === 'admin' && <form className="card form-card" onSubmit={create}><div className="form-heading"><h2>Novo agente</h2><p>A senha é protegida antes de ser salva.</p></div><label>Nome do agente<input name="name" placeholder="Nome e Sobrenome" required /></label><label>E-mail corporativo<input name="corporateEmail" type="email" placeholder="nome@empresa.com.br" required /></label><label>Senha<input name="password" type="password" minLength="6" placeholder="Mínimo de 6 caracteres" required /></label><label>Perfil<select name="role"><option value="agent">Agente</option><option value="admin">Administrador</option></select></label><button className="submit-button"><i className="fa-solid fa-user-plus" />Cadastrar agente</button></form>}
    </div>
    {feedback && <p className="feedback">{feedback}</p>}
    {agent.role === 'admin' && <section className="card agents-card"><div className="form-heading"><h2>Agentes cadastrados</h2><p>Lista visível somente para administradores.</p></div>{agents.map(item => <div className={`agent-row ${item.active ? '' : 'blocked'}`} key={item._id}><i className={`fa-solid ${item.active ? 'fa-user' : 'fa-user-lock'}`} /><span><strong>{item.name}</strong><small>{item.corporateEmail}</small></span><em>{item.active ? (item.role === 'admin' ? 'Administrador' : 'Agente') : 'Bloqueado'}</em><button type="button" className={item.active ? 'block-agent' : 'unblock-agent'} disabled={item._id === agent._id} onClick={() => changeStatus(item)} title={item._id === agent._id ? 'Voce nao pode bloquear sua propria conta' : undefined}><i className={`fa-solid ${item.active ? 'fa-ban' : 'fa-unlock'}`} />{item.active ? 'Bloquear' : 'Reativar'}</button></div>)}</section>}
  </main>;
}
