import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

export default function Settings({ agent, onAgentChange }) {
  const [agents, setAgents] = useState([]);
  const [apiClients, setApiClients] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [revealedKey, setRevealedKey] = useState('');
  const [feedback, setFeedback] = useState('');
  const [agentDrafts, setAgentDrafts] = useState({});
  const [pendingAgentAction, setPendingAgentAction] = useState(null);
  const [savingAgent, setSavingAgent] = useState(false);
  const confirmDialog = useRef(null);
  const adminAccess = agent.role === 'admin';
  const load = async () => {
    if (!adminAccess) return;
    const [agentsResult, clientsResult, auditResult] = await Promise.all([
      api('/agents'),
      api('/api-clients'),
      api('/audit-logs?limit=100'),
    ]);
    setAgents(agentsResult.data);
    setAgentDrafts(
      Object.fromEntries(
        agentsResult.data.map((item) => [
          item._id,
          { name: item.name, corporateEmail: item.corporateEmail, role: item.role, password: '' },
        ]),
      ),
    );
    setApiClients(clientsResult.data);
    setAuditLogs(auditResult.data);
  };
  useEffect(() => {
    load().catch(console.error);
  }, [agent.role]);
  const profile = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(Object.fromEntries(form)),
      });
      onAgentChange(result.data);
      event.currentTarget.reset();
      setFeedback('Perfil atualizado com sucesso.');
    } catch (err) {
      setFeedback(err.message);
    }
  };
  const create = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api('/agents', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      form.reset();
      setFeedback('Agente cadastrado com sucesso.');
      await load();
    } catch (err) {
      setFeedback(err.message);
    }
  };
  const changeStatus = async (item) => {
    try {
      await api(`/agents/${item._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !item.active }),
      });
      setFeedback(item.active ? 'Agente bloqueado com sucesso.' : 'Agente reativado com sucesso.');
      await load();
    } catch (err) {
      setFeedback(err.message);
    }
  };
  const updateAgentDraft = (agentId, field, value) => {
    setAgentDrafts((current) => ({
      ...current,
      [agentId]: { ...current[agentId], [field]: value },
    }));
  };
  const askAgentConfirmation = (action, item) => {
    setPendingAgentAction({ action, item });
    confirmDialog.current?.showModal();
  };
  const closeAgentConfirmation = () => {
    if (savingAgent) return;
    confirmDialog.current?.close();
    setPendingAgentAction(null);
  };
  const confirmAgentAction = async (event) => {
    event.preventDefault();
    if (!pendingAgentAction || savingAgent) return;
    const { action, item } = pendingAgentAction;
    setSavingAgent(true);
    try {
      if (action === 'delete') {
        await api(`/agents/${item._id}`, { method: 'DELETE' });
        setFeedback('Agente excluído permanentemente.');
      } else {
        const result = await api(`/agents/${item._id}`, {
          method: 'PATCH',
          body: JSON.stringify(agentDrafts[item._id]),
        });
        if (item._id === agent._id) onAgentChange(result.data);
        setFeedback('Perfil do agente atualizado com sucesso.');
      }
      confirmDialog.current?.close();
      setPendingAgentAction(null);
      await load();
    } catch (err) {
      setFeedback(err.message);
      confirmDialog.current?.close();
      setPendingAgentAction(null);
    } finally {
      setSavingAgent(false);
    }
  };
  const createApiClient = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const result = await api('/api-clients', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      form.reset();
      setRevealedKey(result.apiKey);
      setFeedback('Integração criada. Copie a chave agora.');
      await load();
    } catch (err) {
      setFeedback(err.message);
    }
  };
  const changeApiClientStatus = async (item) => {
    try {
      await api(`/api-clients/${item._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !item.active }),
      });
      setFeedback(item.active ? 'Integração bloqueada.' : 'Integração reativada.');
      await load();
    } catch (err) {
      setFeedback(err.message);
    }
  };
  const rotateApiKey = async (item) => {
    try {
      const result = await api(`/api-clients/${item._id}/rotate`, { method: 'POST' });
      setRevealedKey(result.apiKey);
      setFeedback(`Nova chave gerada para ${item.name}. A chave anterior foi invalidada.`);
      await load();
    } catch (err) {
      setFeedback(err.message);
    }
  };
  const deleteApiClient = async (item) => {
    if (
      !window.confirm(
        `Excluir permanentemente a integração "${item.name}"? A chave deixará de funcionar imediatamente.`,
      )
    )
      return;
    try {
      await api(`/api-clients/${item._id}`, { method: 'DELETE' });
      setFeedback('Integração e chave excluídas permanentemente.');
      await load();
    } catch (err) {
      setFeedback(err.message);
    }
  };
  const copyApiKey = async () => {
    try {
      await navigator.clipboard.writeText(revealedKey);
      setFeedback('Chave copiada.');
    } catch {
      setFeedback('Não foi possível copiar automaticamente. Selecione a chave abaixo.');
    }
  };
  const changeApiMessageVisibility = async (event) => {
    const showApiMessages = event.target.checked;
    try {
      const result = await api('/auth/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ showApiMessages }),
      });
      onAgentChange(result.data);
      setFeedback(
        showApiMessages
          ? 'Mensagens enviadas pela API agora estão visíveis.'
          : 'Mensagens enviadas pela API agora estão ocultas.',
      );
    } catch (err) {
      setFeedback(err.message);
    }
  };
  return (
    <main className="page settings-page">
      <header>
        <h1>Configurações</h1>
        <p>Gerencie seu perfil, agentes e integrações autorizadas a usar a API.</p>
      </header>
      <div className="settings-grid">
        <form className="card form-card" onSubmit={profile}>
          <div className="form-heading">
            <h2>Meu perfil</h2>
            <p>Altere seu nome ou defina uma nova senha.</p>
          </div>
          <label>
            Nome de usuário
            <input name="name" defaultValue={agent.name} required />
          </label>
          <label>
            Senha atual
            <input name="currentPassword" type="password" required />
          </label>
          <label>
            Nova senha (opcional)
            <input
              name="newPassword"
              type="password"
              minLength="10"
              placeholder="Mínimo de 6 caracteres"
            />
          </label>
          <button className="submit-button">
            <i className="fa-solid fa-floppy-disk" />
            Salvar perfil
          </button>
        </form>
        {adminAccess && (
          <form className="card form-card" onSubmit={create}>
            <div className="form-heading">
              <h2>Novo agente</h2>
              <p>A senha é protegida antes de ser salva.</p>
            </div>
            <label>
              Nome do agente
              <input name="name" placeholder="Nome e Sobrenome" required />
            </label>
            <label>
              E-mail corporativo
              <input
                name="corporateEmail"
                type="email"
                placeholder="nome@empresa.com.br"
                required
              />
            </label>
            <label>
              Senha
              <input
                name="password"
                type="password"
                minLength="10"
                placeholder="Mínimo de 6 caracteres"
                required
              />
            </label>
            <label>
              Perfil
              <select name="role">
                <option value="agent">Agente</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            <button className="submit-button">
              <i className="fa-solid fa-user-plus" />
              Cadastrar agente
            </button>
          </form>
        )}
        {adminAccess && (
          <form className="card form-card" onSubmit={createApiClient}>
            <div className="form-heading">
              <h2>Nova integração</h2>
              <p>Crie uma chave exclusiva para cada site que utilizará a API.</p>
            </div>
            <label>
              Nome do site
              <input name="name" placeholder="Ex.: Audire" required />
            </label>
            <label>
              URL permitida
              <input name="url" type="url" placeholder="https://www.audire.com.br" required />
            </label>
            <button className="submit-button">
              <i className="fa-solid fa-key" />
              Gerar chave da API
            </button>
          </form>
        )}
      </div>
      {revealedKey && (
        <section className="card api-key-result">
          <div>
            <strong>Chave gerada</strong>
            <small>Ela não será exibida novamente. Guarde-a em local seguro.</small>
          </div>
          <code>{revealedKey}</code>
          <button type="button" onClick={copyApiKey}>
            <i className="fa-solid fa-copy" />
            Copiar
          </button>
          <button
            type="button"
            className="dismiss-key"
            onClick={() => setRevealedKey('')}
            aria-label="Ocultar chave"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </section>
      )}
      {feedback && <p className="feedback">{feedback}</p>}
      {adminAccess && (
        <section className="card agents-card">
          <div className="form-heading">
            <h2>Agentes cadastrados</h2>
            <p>Lista visível somente para administradores desbloqueados.</p>
          </div>
          {agents.map((item) => (
            <div className={`agent-row ${item.active ? '' : 'blocked'}`} key={item._id}>
              <i className={`fa-solid ${item.active ? 'fa-user' : 'fa-user-lock'}`} />
              <div className="agent-edit-fields">
                <label>
                  Nome
                  <input
                    value={agentDrafts[item._id]?.name || ''}
                    onChange={(event) => updateAgentDraft(item._id, 'name', event.target.value)}
                  />
                </label>
                <label>
                  E-mail corporativo
                  <input
                    type="email"
                    value={agentDrafts[item._id]?.corporateEmail || ''}
                    onChange={(event) =>
                      updateAgentDraft(item._id, 'corporateEmail', event.target.value)
                    }
                  />
                </label>
                <label>
                  Tipo de usuário
                  <select
                    value={agentDrafts[item._id]?.role || 'agent'}
                    disabled={item._id === agent._id}
                    onChange={(event) => updateAgentDraft(item._id, 'role', event.target.value)}
                  >
                    <option value="agent">Agente</option>
                    <option value="admin">Administrador</option>
                  </select>
                </label>
                <label>
                  Redefinir senha
                  <input
                    type="password"
                    minLength="10"
                    placeholder="Deixe em branco para manter"
                    value={agentDrafts[item._id]?.password || ''}
                    onChange={(event) => updateAgentDraft(item._id, 'password', event.target.value)}
                  />
                </label>
              </div>
              <div className="agent-row-actions">
                <button
                  type="button"
                  className="save-agent"
                  onClick={() => askAgentConfirmation('save', item)}
                >
                  <i className="fa-solid fa-floppy-disk" /> Salvar
                </button>
                <button
                  type="button"
                  className={item.active ? 'block-agent' : 'unblock-agent'}
                  disabled={item._id === agent._id}
                  onClick={() => changeStatus(item)}
                >
                  <i className={`fa-solid ${item.active ? 'fa-ban' : 'fa-unlock'}`} />
                  {item.active ? 'Bloquear' : 'Reativar'}
                </button>
                <button
                  type="button"
                  className="delete-agent"
                  disabled={item._id === agent._id}
                  onClick={() => askAgentConfirmation('delete', item)}
                >
                  <i className="fa-solid fa-trash" /> Excluir
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
      {adminAccess && (
        <dialog
          ref={confirmDialog}
          className="card agent-confirm-dialog"
          aria-labelledby="agent-confirm-title"
          onCancel={(event) => {
            event.preventDefault();
            closeAgentConfirmation();
          }}
        >
          <form onSubmit={confirmAgentAction}>
            <div className="agent-confirm-title">
              <i
                className={`fa-solid ${pendingAgentAction?.action === 'delete' ? 'fa-trash' : 'fa-user-pen'}`}
              />
              <div>
                <h2 id="agent-confirm-title">
                  {pendingAgentAction?.action === 'delete'
                    ? 'Excluir este agente?'
                    : 'Confirmar alterações?'}
                </h2>
                <p>
                  {pendingAgentAction?.action === 'delete'
                    ? `O registro de ${pendingAgentAction?.item.name || 'este agente'} será apagado permanentemente.`
                    : `As alterações no perfil de ${pendingAgentAction?.item.name || 'este agente'} serão salvas.`}
                </p>
              </div>
            </div>
            <div className="agent-confirm-actions">
              <button type="button" onClick={closeAgentConfirmation} disabled={savingAgent}>
                Cancelar
              </button>
              <button
                type="submit"
                className={pendingAgentAction?.action === 'delete' ? 'danger' : 'submit-button'}
                disabled={savingAgent}
              >
                <i className={`fa-solid ${savingAgent ? 'fa-spinner fa-spin' : 'fa-check'}`} />
                {savingAgent ? 'Aguarde...' : 'Confirmar'}
              </button>
            </div>
          </form>
        </dialog>
      )}
      {adminAccess && (
        <section className="card agents-card api-clients-card">
          <div className="api-clients-heading">
            <div className="form-heading">
              <h2>Integrações da API</h2>
              <p>Cada chave só pode ser usada pelo site associado quando enviada pelo navegador.</p>
            </div>
            <label className="api-visibility-switch">
              <span className="switch-label">Visualizar mensagens da API</span>
              <input
                type="checkbox"
                checked={agent.showApiMessages === true}
                onChange={changeApiMessageVisibility}
              />
              <span className="switch-track" aria-hidden="true">
                <span className="switch-thumb" />
              </span>
            </label>
          </div>
          {!apiClients.length && <p>Nenhuma integração cadastrada.</p>}
          {apiClients.map((item) => (
            <div className={`api-client-row ${item.active ? '' : 'blocked'}`} key={item._id}>
              <i className="fa-solid fa-globe" />
              <span>
                <strong>{item.name}</strong>
                <small>{item.allowedOrigin}</small>
                <code>{item.keyPrefix}</code>
              </span>
              <div className="api-client-usage">
                <em>{item.active ? 'Ativa' : 'Bloqueada'}</em>
                <small>
                  {item.lastUsedAt
                    ? `Último uso: ${new Date(item.lastUsedAt).toLocaleString('pt-BR')}`
                    : 'Nunca utilizada'}
                </small>
              </div>
              <button type="button" onClick={() => rotateApiKey(item)} title="Gerar uma nova chave">
                <i className="fa-solid fa-rotate" />
                Nova chave
              </button>
              <button
                type="button"
                className={item.active ? 'block-agent' : 'unblock-agent'}
                onClick={() => changeApiClientStatus(item)}
              >
                <i className={`fa-solid ${item.active ? 'fa-ban' : 'fa-unlock'}`} />
                {item.active ? 'Bloquear' : 'Reativar'}
              </button>
              <button
                type="button"
                className="delete-api-client"
                onClick={() => deleteApiClient(item)}
                title="Excluir integração"
              >
                <i className="fa-solid fa-trash" />
                Excluir
              </button>
            </div>
          ))}
        </section>
      )}
      {adminAccess && (
        <section className="card agents-card audit-card">
          <div className="form-heading audit-heading">
            <div>
              <h2>Auditoria</h2>
              <p>Últimas 100 ações. Senhas, chaves e conteúdo de mensagens ficam ocultos.</p>
            </div>
            <button type="button" onClick={() => load().catch(console.error)}>
              <i className="fa-solid fa-rotate" />
              Atualizar
            </button>
          </div>
          <div className="audit-list">
            {auditLogs.map((item) => (
              <article className={`audit-row ${item.success ? '' : 'failed'}`} key={item._id}>
                <i className={`fa-solid ${item.success ? 'fa-circle-check' : 'fa-circle-xmark'}`} />
                <span>
                  <strong>{item.action}</strong>
                  <small>
                    {item.actorName ||
                      (item.actorType === 'system' ? 'Sistema' : 'Não identificado')}{' '}
                    · {item.method} {item.path || item.targetId}
                  </small>
                  <code>{item.requestId || item.targetId}</code>
                </span>
                <time>{new Date(item.createdAt).toLocaleString('pt-BR')}</time>
                <em>{item.statusCode || (item.success ? 'OK' : 'Falha')}</em>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
