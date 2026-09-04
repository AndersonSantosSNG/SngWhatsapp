import { useState } from 'react';
import Avatar from './Avatar';

export default function TicketList({ tickets, loading, activeId, unreadByTicket, onSelect, reload, onNewConversation, theme, setTheme }) {
  const [search, setSearch] = useState('');
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const visibleTickets = tickets.filter(ticket => {
    if (!normalizedSearch) return true;
    const name = (ticket.contactName || '').toLocaleLowerCase('pt-BR');
    const phone = String(ticket.phoneNumber || '').toLocaleLowerCase('pt-BR');
    const digits = normalizedSearch.replace(/\D/g, '');
    return name.includes(normalizedSearch) || phone.includes(normalizedSearch) || (digits && phone.replace(/\D/g, '').includes(digits));
  });
  const submitNewConversation = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const number = String(form.get('number') || '').replace(/\D/g, '');
    const message = String(form.get('message') || '').trim();
    if (number.length < 10 || number.length > 15) return setSendError('Informe o número com DDD e código do país.');
    setSending(true);
    setSendError('');
    try {
      await onNewConversation(number, message);
      setShowNewConversation(false);
    } catch (err) {
      setSendError(err.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  };

  return <section className="ticket-column">
    <header><h2>Conversas</h2><div>
      <button onClick={() => { setSendError(''); setShowNewConversation(true); }} title="Nova conversa" aria-label="Nova conversa"><i className="fa-solid fa-pen-to-square" /></button>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Alternar tema"><i className={`fa-solid ${theme === 'light' ? 'fa-moon' : 'fa-sun'}`} /></button>
      <button onClick={reload} title="Recarregar"><i className="fa-solid fa-rotate-right" /></button>
    </div></header>
    <div className="conversation-search"><i className="fa-solid fa-magnifying-glass" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar nome ou número" aria-label="Pesquisar conversas" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Limpar pesquisa"><i className="fa-solid fa-xmark" /></button>}</div>
    <div className="ticket-list">
      {loading && <div className="ticket-loading" role="status" aria-label="Carregando conversas"><div className="ticket-spinner" /><span>Carregando conversas...</span></div>}
      {!loading && !visibleTickets.length && <p className="empty">{search ? 'Nenhuma conversa encontrada para esta busca.' : 'Nenhuma conversa encontrada.'}</p>}
      {!loading && visibleTickets.map(ticket => {
        const generic = ['', 'Grupo', 'Grupo sem nome', 'Grupo do WhatsApp'];
        const name = ticket.isGroup ? (generic.includes((ticket.contactName || '').trim()) ? 'Grupo do WhatsApp' : ticket.contactName) : (ticket.contactName || ticket.phoneNumber);
        const unreadCount = unreadByTicket[ticket._id]?.count || 0;
        return <button type="button" key={ticket._id} className={`ticket-item ${activeId === ticket._id ? 'selected' : ''} ${unreadCount ? 'unread' : ''}`} onClick={() => onSelect(ticket)}>
          <Avatar ticket={ticket} /><span className="ticket-content"><span className="ticket-top"><strong>{name}</strong>{unreadCount > 0 && <span className="unread-count" aria-label={`${unreadCount} mensagens novas`}>{unreadCount > 99 ? '99+' : unreadCount}</span>}<em className={`badge ${ticket.status}`}>{ticket.status === 'closed' ? 'Encerrado' : ticket.status === 'open' ? 'Aberto' : 'Pendente'}</em></span><small>{ticket.isGroup ? 'Grupo' : ticket.phoneNumber}</small><span className="last-message">{ticket.lastMessage === '[Mídia/Arquivo]' ? '📎 Mídia' : ticket.lastMessage || 'Sem mensagens'}</span></span>
        </button>;
      })}
    </div>
    {showNewConversation && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !sending) setShowNewConversation(false); }}><form className="card new-conversation-card" onSubmit={submitNewConversation}><div className="new-conversation-title"><i className="fa-solid fa-comment-medical" /><div><h2>Nova conversa</h2><p>Envie uma mensagem para um número que ainda não está na lista.</p></div></div><label>Número do WhatsApp<input name="number" type="tel" inputMode="tel" placeholder="Ex.: 5511999999999" required autoFocus /></label><label>Mensagem<textarea name="message" rows="4" placeholder="Digite a primeira mensagem" required /></label>{sendError && <p className="form-error">{sendError}</p>}<div className="new-conversation-actions"><button type="button" onClick={() => setShowNewConversation(false)} disabled={sending}>Cancelar</button><button type="submit" className="submit-button" disabled={sending}>{sending ? 'Enviando...' : 'Enviar mensagem'}</button></div></form></div>}
  </section>;
}
