import { useState } from 'react';
import logo from '../assets/logo.png';

const items = [
  ['tickets', 'fa-comments', 'Atendimentos'],
  ['dashboard', 'fa-chart-line', 'Status & QR Code'],
  ['settings', 'fa-gear', 'Configurações']
];

export default function Sidebar({ tab, setTab, agent, connected, collapsed, setCollapsed, logout }) {
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const handleLogout = async () => {
    setLoggingOut(true);
    try { await logout(); }
    finally { setLoggingOut(false); setConfirmLogout(false); }
  };
  return (
    <>
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div>
        <header className="sidebar-brand">
          {!collapsed && <><img className="brand-logo" src={logo} alt="SNG" /><strong>SNG Chat</strong></>}
          <button onClick={() => setCollapsed(!collapsed)} title="Expandir ou recolher"><i className={`fa-solid fa-angles-${collapsed ? 'right' : 'left'}`} /></button>
        </header>
        <nav>{items.map(([id, icon, label]) => <button key={id} title={label} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><i className={`fa-solid ${icon}`} />{!collapsed && <span>{label}</span>}</button>)}<button className="mobile-logout" onClick={() => setConfirmLogout(true)} title="Sair"><i className="fa-solid fa-right-from-bracket" /><span>Sair</span></button></nav>
      </div>
      <footer>
        <div title={agent?.name}><i className="fa-solid fa-headset" />{!collapsed && <span>{agent?.name}{agent?.role === 'admin' ? ' (Admin)' : ''}</span>}</div>
        <div><span className={`status-dot ${connected ? 'connected' : ''}`} />{!collapsed && <span>{connected ? 'Servidor conectado' : 'Servidor desconectado'}</span>}</div>
        <button onClick={() => setConfirmLogout(true)} title="Sair"><i className="fa-solid fa-right-from-bracket" />{!collapsed && <span>Sair do agente</span>}</button>
      </footer>
    </aside>
    {confirmLogout && <div className="modal-backdrop logout-confirm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !loggingOut) setConfirmLogout(false); }}><div className="card logout-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="logout-confirm-title"><i className="fa-solid fa-right-from-bracket" /><div><h2 id="logout-confirm-title">Sair do agente?</h2><p>Você precisará entrar novamente para acessar os atendimentos.</p></div><div className="logout-confirm-actions"><button type="button" onClick={() => setConfirmLogout(false)} disabled={loggingOut}>Cancelar</button><button type="button" className="danger" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? 'Saindo...' : 'Confirmar saída'}</button></div></div></div>}
    </>
  );
}
