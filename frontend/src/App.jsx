import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api, sendMessage } from './services/api';
import Sidebar from './components/Sidebar';
import TicketList from './components/TicketList';
import ChatPanel from './components/ChatPanel';
import LoginModal from './components/LoginModal';
import Settings from './components/Settings';
import Dashboard from './components/Dashboard';
import { storage } from './services/storage';

const socket = io({ transports: ['websocket', 'polling'], reconnectionAttempts: 5 });

export default function App() {
  const [agent, setAgent] = useState(null);
  const [tab, setTab] = useState('tickets');
  const [tickets, setTickets] = useState([]);
  const [activeTicket, setActiveTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [unreadByTicket, setUnreadByTicket] = useState({});
  const [unreadMarker, setUnreadMarker] = useState(null);
  const [connected, setConnected] = useState(false);
  const [qr, setQr] = useState('');
  const [viewer, setViewer] = useState('');
  const [theme, setThemeState] = useState(storage.get('panelTheme', 'dark'));
  const [collapsed, setCollapsedState] = useState(storage.get('sidebarCollapsed') === 'true');

  const setTheme = value => { setThemeState(value); storage.set('panelTheme', value); };
  const setCollapsed = value => { setCollapsedState(value); storage.set('sidebarCollapsed', value); };
  const loadTickets = useCallback(async () => setTickets((await api('/tickets')).data), []);
  const loadWhatsAppStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/qr');
      const result = await response.json();
      setConnected(Boolean(result.connected));
      if (result.qr) setQr(result.qr);
    } catch { setConnected(false); }
  }, []);
  const selectTicket = async ticket => {
    const unread = unreadByTicket[ticket._id] || null;
    setActiveTicket(ticket);
    setMessages([]);
    setUnreadMarker(unread);
    setUnreadByTicket(current => {
      if (!current[ticket._id]) return current;
      const next = { ...current };
      delete next[ticket._id];
      return next;
    });
    const result = await api(`/tickets/${ticket._id}/messages`);
    setMessages(result.data.map(message => ({ ...message, mediaUrl: message.hasMedia ? `/api/messages/${message._id}/media` : message.mediaUrl })));
  };

  useEffect(() => {
    api('/auth/me').then(result => setAgent(result.data)).catch(() => { storage.remove('agentAuthToken'); setAgent(null); });
    loadTickets().catch(console.error);
    loadWhatsAppStatus();
  }, []);

  useEffect(() => {
    const onConnect = () => loadWhatsAppStatus();
    const onDisconnect = () => setConnected(false);
    const onQr = data => { setQr(data.qr); setConnected(false); };
    const onMessage = data => {
      const message = data.message || data;
      setConnected(true);
      loadTickets().catch(console.error);
      if (activeTicket?._id === message.ticketId) setMessages(current => current.some(item => (item.id || item._id) === message.id) ? current : [...current, message]);
      if (agent && !message.fromMe && activeTicket?._id !== message.ticketId) {
        setUnreadByTicket(current => {
          const unread = current[message.ticketId];
          return { ...current, [message.ticketId]: { count: (unread?.count || 0) + 1, firstMessageId: unread?.firstMessageId || message.id } };
        });
      }
    };
    const onAck = ({ messageId, ack }) => setMessages(current => current.map(message => (message.id || message._id) === messageId ? { ...message, ack } : message));
    socket.on('connect', onConnect); socket.on('disconnect', onDisconnect); socket.on('qr_code', onQr); socket.on('new_message', onMessage); socket.on('message_ack', onAck);
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('qr_code', onQr); socket.off('new_message', onMessage); socket.off('message_ack', onAck); };
  }, [activeTicket?._id, agent?._id, loadTickets, loadWhatsAppStatus]);

  const login = async (corporateEmail, password) => { const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ corporateEmail, password }) }); storage.set('agentAuthToken', result.token); setAgent(result.data); };
  const logout = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch {} storage.remove('agentAuthToken'); setUnreadByTicket({}); setUnreadMarker(null); setAgent(null); };
  const send = message => sendMessage({ number: activeTicket.phoneNumber, message });
  const sendFile = async (file, caption) => { const data = await file.arrayBuffer(); let binary = ''; new Uint8Array(data).forEach(byte => { binary += String.fromCharCode(byte); }); await sendMessage({ number: activeTicket.phoneNumber, message: caption, fileBase64: btoa(binary), mimeType: file.type, fileName: file.name }); };
  const updateTicket = async action => { const result = await api(`/tickets/${action}`, { method: 'POST', body: JSON.stringify({ ticketId: activeTicket._id, agentId: agent._id }) }); setActiveTicket(result.data); await loadTickets(); };
  const toggle = () => updateTicket(activeTicket.status === 'open' ? 'unclaim' : 'claim');
  const close = async () => { await updateTicket('close'); setActiveTicket(null); setMessages([]); };

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  const totalUnread = Object.values(unreadByTicket).reduce((total, unread) => total + unread.count, 0);
  useEffect(() => {
    document.title = totalUnread ? `(${totalUnread}) SNG Chat` : 'SNG Chat';
  }, [totalUnread]);

  return <div className="app-shell">
    {agent && <Sidebar {...{ tab, setTab, agent, connected, collapsed, setCollapsed, logout }} />}
    {agent && tab === 'tickets' && <main className="conversations-layout"><TicketList {...{ tickets, activeId: activeTicket?._id, unreadByTicket, onSelect: selectTicket, reload: loadTickets, theme, setTheme }} /><ChatPanel ticket={activeTicket} messages={messages} unreadMarker={unreadMarker} onSend={send} onFile={sendFile} onToggle={toggle} onClose={close} onOpenImage={setViewer} /></main>}
    {agent && tab === 'dashboard' && <Dashboard connected={connected} qr={qr} />}
    {agent && tab === 'settings' && <Settings agent={agent} onAgentChange={setAgent} />}
    {!agent && <LoginModal onLogin={login} />}
    {viewer && <div className="media-viewer" onClick={() => setViewer('')}><button><i className="fa-solid fa-xmark" /></button><img src={viewer} alt="Visualização da mídia" /></div>}
  </div>;
}
