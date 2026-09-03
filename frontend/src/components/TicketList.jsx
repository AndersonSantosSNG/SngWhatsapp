import Avatar from './Avatar';

export default function TicketList({ tickets, activeId, unreadByTicket, onSelect, reload, theme, setTheme }) {
  return <section className="ticket-column">
    <header><h2>Conversas</h2><div>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Alternar tema"><i className={`fa-solid ${theme === 'light' ? 'fa-moon' : 'fa-sun'}`} /></button>
      <button onClick={reload} title="Recarregar"><i className="fa-solid fa-rotate-right" /></button>
    </div></header>
    <div className="ticket-list">
      {!tickets.length && <p className="empty">Nenhuma conversa encontrada.</p>}
      {tickets.map(ticket => {
        const generic = ['', 'Grupo', 'Grupo sem nome', 'Grupo do WhatsApp'];
        const name = ticket.isGroup ? (generic.includes((ticket.contactName || '').trim()) ? 'Grupo do WhatsApp' : ticket.contactName) : (ticket.contactName || ticket.phoneNumber);
        const unreadCount = unreadByTicket[ticket._id]?.count || 0;
        return <button type="button" key={ticket._id} className={`ticket-item ${activeId === ticket._id ? 'selected' : ''} ${unreadCount ? 'unread' : ''}`} onClick={() => onSelect(ticket)}>
          <Avatar ticket={ticket} /><span className="ticket-content"><span className="ticket-top"><strong>{name}</strong>{unreadCount > 0 && <span className="unread-count" aria-label={`${unreadCount} mensagens novas`}>{unreadCount > 99 ? '99+' : unreadCount}</span>}<em className={`badge ${ticket.status}`}>{ticket.status === 'closed' ? 'Encerrado' : ticket.status === 'open' ? 'Aberto' : 'Pendente'}</em></span><small>{ticket.isGroup ? 'Grupo' : ticket.phoneNumber}</small><span className="last-message">{ticket.lastMessage === '[Mídia/Arquivo]' ? '📎 Mídia' : ticket.lastMessage || 'Sem mensagens'}</span></span>
        </button>;
      })}
    </div>
  </section>;
}
