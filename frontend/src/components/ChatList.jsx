import { useState } from 'react';
import Avatar from './Avatar';
import { formatPhone, maskNationalPhone } from '../utils/phone';

function formatLastMessageTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const elapsed = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(elapsed / 60000);
  const hours = Math.floor(elapsed / 3600000);
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMessageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const calendarDays = Math.round((startToday - startMessageDay) / 86400000);

  if (calendarDays === 0) {
    const relative = minutes < 1 ? 'agora' : hours < 1 ? `há ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}` : `há ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
    return `${time} (${relative})`;
  }
  if (calendarDays === 1) return `Ontem às ${time} (há ${Math.max(1, hours)} horas)`;

  const dateText = date.toLocaleDateString('pt-BR');
  return `${dateText} às ${time} (há ${calendarDays} dias)`;
}

export default function ChatList({ chats, loading, activeId, agentId, unreadByChat, onSelect, reload, onNewConversation, theme, setTheme }) {
  const [search, setSearch] = useState('');
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [international, setInternational] = useState(false);
  const [countryCode, setCountryCode] = useState('');
  const [filter, setFilter] = useState('all');
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const visibleChats = chats.filter(chat => {
    if (filter === 'pending' && chat.status !== 'pending') return false;
    if (filter === 'open' && chat.status !== 'open') return false;
    if (filter === 'closed' && chat.status !== 'closed') return false;
    if (filter === 'unread' && !(unreadByChat[chat._id]?.count > 0)) return false;
    if (filter === 'groups' && !chat.isGroup) return false;
    if (filter === 'mine' && String(chat.assignedAgent || '') !== String(agentId || '')) return false;
    if (!normalizedSearch) return true;
    const name = (chat.contactName || '').toLocaleLowerCase('pt-BR');
    const phone = String(chat.phoneNumber || '').toLocaleLowerCase('pt-BR');
    const digits = normalizedSearch.replace(/\D/g, '');
    return name.includes(normalizedSearch) || phone.includes(normalizedSearch) || (digits && phone.replace(/\D/g, '').includes(digits));
  });
  const submitNewConversation = async event => {
    event.preventDefault();
    const localNumber = newPhone.replace(/\D/g, '');
    const code = international ? countryCode.replace(/\D/g, '') : '55';
    const number = `${code}${localNumber}`;
    if (localNumber.length < 10 || localNumber.length > 11) return setSendError('Informe o DDD e o telefone corretamente.');
    if (international && (!code || number.length > 15)) return setSendError('Informe um código de país válido.');
    setSending(true);
    setSendError('');
    try {
      await onNewConversation(number);
      setShowNewConversation(false);
      setNewPhone('');
      setCountryCode('');
      setInternational(false);
    } catch (err) {
      setSendError(err.message || 'Não foi possível abrir a conversa.');
    } finally {
      setSending(false);
    }
  };

  return <section className="chat-column">
    <header><h2>Conversas</h2><div>
      <button onClick={() => { setSendError(''); setShowNewConversation(true); }} title="Nova conversa" aria-label="Nova conversa"><i className="fa-solid fa-pen-to-square" /></button>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Alternar tema"><i className={`fa-solid ${theme === 'light' ? 'fa-moon' : 'fa-sun'}`} /></button>
      <button onClick={reload} title="Recarregar"><i className="fa-solid fa-rotate-right" /></button>
    </div></header>
    <div className="conversation-search"><i className="fa-solid fa-magnifying-glass" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar nome ou número" aria-label="Pesquisar conversas" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Limpar pesquisa"><i className="fa-solid fa-xmark" /></button>}</div>
    <div className="chat-filters">{[['all', 'Todas'], ['mine', 'Meus atendimentos'], ['pending', 'Pendentes'], ['open', 'Em atendimento'], ['closed', 'Encerradas'], ['unread', 'Não lidas'], ['groups', 'Grupos']].map(([value, label]) => <button type="button" key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>
    <div className="chat-list">
      {loading && <div className="chat-loading" role="status" aria-label="Carregando conversas"><div className="chat-spinner" /><span>Carregando conversas...</span></div>}
      {!loading && !visibleChats.length && <p className="empty">{search ? 'Nenhuma conversa encontrada para esta busca.' : 'Nenhuma conversa encontrada.'}</p>}
      {!loading && visibleChats.map(chat => {
        const generic = ['', 'Grupo', 'Grupo sem nome', 'Grupo do WhatsApp'];
        const rawName = chat.contactName || chat.phoneNumber;
        const name = chat.isGroup ? (generic.includes((chat.contactName || '').trim()) ? 'Grupo do WhatsApp' : chat.contactName) : (/^\+?\d+$/.test(String(rawName)) ? formatPhone(rawName) : rawName);
        const unreadCount = unreadByChat[chat._id]?.count || 0;
        const lastMessageTime = formatLastMessageTime(chat.lastMessageAt);
        return <button type="button" key={chat._id} className={`chat-item ${activeId === chat._id ? 'selected' : ''} ${unreadCount ? 'unread' : ''}`} onClick={() => onSelect(chat)}>
          <Avatar chat={chat} /><span className="chat-content"><span className="chat-top"><strong>{name}</strong>{unreadCount > 0 && <span className="unread-count" aria-label={`${unreadCount} mensagens novas`}>{unreadCount > 99 ? '99+' : unreadCount}</span>}<em className={`badge ${chat.status}`}>{chat.status === 'closed' ? 'Encerrado' : chat.status === 'open' ? 'Em atendimento' : 'Pendente'}</em></span><span className="chat-meta"><small>{chat.isGroup ? 'Grupo' : formatPhone(chat.phoneNumber)}</small>{lastMessageTime && <time dateTime={chat.lastMessageAt}>{lastMessageTime}</time>}</span><span className="last-message">{chat.lastMessage === '[Mídia/Arquivo]' ? '📎 Mídia' : chat.lastMessage || 'Sem mensagens'}</span></span>
        </button>;
      })}
    </div>
    {showNewConversation && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !sending) setShowNewConversation(false); }}><form className="card new-conversation-card" onSubmit={submitNewConversation}><div className="new-conversation-title"><i className="fa-solid fa-comment-medical" /><div><h2>Nova conversa</h2><p>Informe o DDD e o telefone para abrir a conversa.</p></div></div><label className="international-option"><input type="checkbox" checked={international} onChange={event => { setInternational(event.target.checked); setCountryCode(''); setSendError(''); }} /><span>É número internacional?</span></label>{international && <label>Código do país<input type="tel" inputMode="numeric" value={countryCode} onChange={event => setCountryCode(event.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Ex.: 1" required autoFocus /></label>}<label>DDD + telefone<input type="tel" inputMode="numeric" value={newPhone} onChange={event => setNewPhone(maskNationalPhone(event.target.value))} placeholder="(99) 99999-9999" required autoFocus={!international} /></label>{sendError && <p className="form-error">{sendError}</p>}<div className="new-conversation-actions"><button type="button" onClick={() => setShowNewConversation(false)} disabled={sending}>Cancelar</button><button type="submit" className="submit-button" disabled={sending}>{sending ? 'Abrindo...' : 'Abrir conversa'}</button></div></form></div>}
  </section>;
}
