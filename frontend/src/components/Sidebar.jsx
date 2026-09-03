import logo from '../assets/logo.png';

const items = [
  ['tickets', 'fa-comments', 'Atendimentos'],
  ['dashboard', 'fa-chart-line', 'Status & QR Code'],
  ['settings', 'fa-gear', 'Configurações']
];

export default function Sidebar({ tab, setTab, agent, connected, collapsed, setCollapsed, logout }) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div>
        <header className="sidebar-brand">
          {!collapsed && <><img className="brand-logo" src={logo} alt="SNG" /><strong>SNG Chat</strong></>}
          <button onClick={() => setCollapsed(!collapsed)} title="Expandir ou recolher"><i className={`fa-solid fa-angles-${collapsed ? 'right' : 'left'}`} /></button>
        </header>
        <nav>{items.map(([id, icon, label]) => <button key={id} title={label} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><i className={`fa-solid ${icon}`} />{!collapsed && <span>{label}</span>}</button>)}</nav>
      </div>
      <footer>
        <div title={agent?.name}><i className="fa-solid fa-headset" />{!collapsed && <span>{agent?.name}{agent?.role === 'admin' ? ' (Admin)' : ''}</span>}</div>
        <div><span className={`status-dot ${connected ? 'connected' : ''}`} />{!collapsed && <span>{connected ? 'Servidor conectado' : 'Servidor desconectado'}</span>}</div>
        <button onClick={logout} title="Sair"><i className="fa-solid fa-right-from-bracket" />{!collapsed && <span>Sair do agente</span>}</button>
      </footer>
    </aside>
  );
}
