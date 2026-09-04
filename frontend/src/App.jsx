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
import logo from './assets/logo.png';

const socket = io({ autoConnect: false, transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000, reconnectionDelayMax: 1000 });

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [agent, setAgent] = useState(null);
  const [tab, setTab] = useState('tickets');
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [activeTicket, setActiveTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [contactOnline, setContactOnline] = useState(false);
  const [unreadByTicket, setUnreadByTicket] = useState({});
  const [unreadMarker, setUnreadMarker] = useState(null);
  const [connected, setConnected] = useState(false);
  const [qr, setQr] = useState('');
  const [viewer, setViewer] = useState('');
  const [theme, setThemeState] = useState(storage.get('panelTheme', 'dark'));
  const [collapsed, setCollapsedState] = useState(storage.get('sidebarCollapsed') === 'true');
  const [authNotice, setAuthNotice] = useState('');
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => setToast(null), 4500);
  };

  const setTheme = value => { setThemeState(value); storage.set('panelTheme', value); };
  const setCollapsed = value => { setCollapsedState(value); storage.set('sidebarCollapsed', value); };
  useEffect(() => {
    const handleSessionExpired = event => {
      socket.disconnect();
      storage.remove('agentAuthToken');
      setAgent(null);
      setActiveTicket(null);
      setMessages([]);
      setAuthNotice(event.detail?.message || 'Sua sessão expirou. Entre novamente para continuar.');
    };
    window.addEventListener('session-expired', handleSessionExpired);
    return () => window.removeEventListener('session-expired', handleSessionExpired);
  }, []);
  const loadTickets = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setTicketsLoading(true);
    try {
      setTickets((await api('/tickets')).data);
    } finally {
      if (showLoading) setTicketsLoading(false);
    }
  }, []);
  const loadWhatsAppStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/qr');
      const result = await response.json();
      setConnected(Boolean(result.connected));
      if (result.qr) setQr(result.qr);
    } catch { setConnected(false); }
  }, []);
  const discardTemporaryTicket = async ticket => {
    if (!ticket?.isTemporary) return false;
    try {
      const result = await api('/tickets/discard-temporary', { method: 'POST', body: JSON.stringify({ ticketId: ticket._id }) });
      if (result.discarded) setTickets(current => current.filter(item => item._id !== ticket._id));
      return Boolean(result.discarded);
    } catch (err) {
      console.error('Não foi possível descartar a conversa temporária:', err);
      return false;
    }
  };
  const selectTicket = async ticket => {
    if (activeTicket?._id !== ticket._id) await discardTemporaryTicket(activeTicket);
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
    const result = await api(`/tickets/${ticket._id}/messages?limit=100`);
    setMessages(result.data.map(message => ({ ...message, mediaUrl: message.hasMedia ? `/api/messages/${message._id}/media` : message.mediaUrl })));
    setHasOlderMessages(Boolean(result.meta?.hasMore));
  };
  const loadOlderMessages = async () => {
    if (!activeTicket || !messages.length || loadingOlderMessages) return;
    setLoadingOlderMessages(true);
    try {
      const oldest = messages[0].timestamp || messages[0].createdAt;
      const result = await api(`/tickets/${activeTicket._id}/messages?limit=100&before=${encodeURIComponent(oldest)}`);
      const older = result.data.map(message => ({ ...message, mediaUrl: message.hasMedia ? `/api/messages/${message._id}/media` : message.mediaUrl }));
      setMessages(current => [...older.filter(item => !current.some(saved => String(saved.id || saved._id) === String(item.id || item._id))), ...current]);
      setHasOlderMessages(Boolean(result.meta?.hasMore));
    } finally { setLoadingOlderMessages(false); }
  };

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      while (active) {
        try {
          const response = await fetch('/api/health', { cache: 'no-store' });
          if (!response.ok) throw new Error('Servidor indisponivel');
          setServerAvailable(true);
          break;
        } catch {
          setServerAvailable(false);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      if (!active) return;
      try {
        const result = await api('/auth/me');
        if (!active) return;
        setAgent(result.data);
        socket.auth = { token: storage.get('agentAuthToken') };
        socket.connect();
        await Promise.allSettled([loadTickets(), loadWhatsAppStatus()]);
      } catch {
        storage.remove('agentAuthToken');
        if (active) setAgent(null);
      } finally {
        if (active) setInitializing(false);
      }
    };

    initialize();
    return () => { active = false; };
  }, [loadTickets, loadWhatsAppStatus]);

  useEffect(() => {
    if (initializing || serverAvailable) return undefined;
    let active = true;
    const checkServer = async () => {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' });
        if (!response.ok) return;
        if (active) {
          setServerAvailable(true);
          if (agent && !socket.connected) socket.connect();
        }
      } catch {}
    };
    checkServer();
    const interval = setInterval(checkServer, 1000);
    return () => { active = false; clearInterval(interval); };
  }, [initializing, serverAvailable, agent]);

  useEffect(() => {
    const onConnect = () => { setServerAvailable(true); loadWhatsAppStatus(); };
    const onDisconnect = () => { setServerAvailable(false); setConnected(false); showToast('Conexão com o servidor perdida. Tentando reconectar...', 'error'); };
    const onQr = data => { setQr(data.qr); setConnected(false); };
    const onMessage = data => {
      const message = data.message || data;
      setConnected(true);
      loadTickets({ showLoading: false }).catch(console.error);
      if (activeTicket?._id === message.ticketId) setMessages(current => current.some(item => (item.id || item._id) === message.id) ? current : [...current, message]);
      if (agent && !message.fromMe && activeTicket?._id !== message.ticketId) {
        setUnreadByTicket(current => {
          const unread = current[message.ticketId];
          return { ...current, [message.ticketId]: { count: (unread?.count || 0) + 1, firstMessageId: unread?.firstMessageId || message.id } };
        });
      }
    };
    const onAck = ({ messageId, ack }) => setMessages(current => current.map(message => (message.id || message._id) === messageId ? { ...message, ack } : message));
    const onTicketEvent = event => {
      if (activeTicket?._id === event.ticketId) setMessages(current => current.some(item => (item.id || item._id) === event.id) ? current : [...current, event]);
    };
    const onHistorySyncComplete = () => loadTickets().catch(console.error);
    socket.on('connect', onConnect); socket.on('disconnect', onDisconnect); socket.on('qr_code', onQr); socket.on('new_message', onMessage); socket.on('message_ack', onAck); socket.on('ticket_event', onTicketEvent); socket.on('history_sync_complete', onHistorySyncComplete);
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('qr_code', onQr); socket.off('new_message', onMessage); socket.off('message_ack', onAck); socket.off('ticket_event', onTicketEvent); socket.off('history_sync_complete', onHistorySyncComplete); };
  }, [activeTicket?._id, agent?._id, loadTickets, loadWhatsAppStatus]);

  useEffect(() => {
    setContactOnline(false);
    if (!agent || !activeTicket || activeTicket.isGroup) return undefined;

    let active = true;
    const loadPresence = async () => {
      try {
        const contactId = activeTicket.whatsappId || activeTicket.phoneNumber;
        const result = await api(`/whatsapp/presence?contactId=${encodeURIComponent(contactId)}&phoneNumber=${encodeURIComponent(activeTicket.phoneNumber || '')}`);
        if (active) setContactOnline(result.data?.isOnline === true);
      } catch {
        if (active) setContactOnline(false);
      }
    };

    loadPresence();
    const interval = setInterval(loadPresence, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [agent, activeTicket?._id, activeTicket?.isGroup, activeTicket?.phoneNumber, activeTicket?.whatsappId]);

  const login = async (corporateEmail, password) => { const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ corporateEmail, password }) }); storage.set('agentAuthToken', result.token); socket.auth = { token: result.token }; socket.connect(); setAuthNotice(''); setAgent(result.data); await loadTickets(); };
  const logout = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch {} socket.disconnect(); storage.remove('agentAuthToken'); setUnreadByTicket({}); setUnreadMarker(null); setAgent(null); };
  const send = (message, replyToMessageId) => sendMessage({ number: activeTicket.phoneNumber, message, replyToMessageId });
  const startConversation = async number => {
    const result = await api('/tickets/start', { method: 'POST', body: JSON.stringify({ phoneNumber: number }) });
    console.log('[NOVA CONVERSA][PAYLOAD WHATSAPP]', result.whatsappPayload);
    await loadTickets({ showLoading: false });
    await selectTicket({ ...result.data, contactName: result.data.contactName || result.data.name });
  };
  const sendFile = async (file, caption, replyToMessageId) => { const data = await file.arrayBuffer(); let binary = ''; new Uint8Array(data).forEach(byte => { binary += String.fromCharCode(byte); }); await sendMessage({ number: activeTicket.phoneNumber, message: caption, replyToMessageId, fileBase64: btoa(binary), mimeType: file.type, fileName: file.name }); };
  const updateTicket = async action => {
    try {
      const result = await api(`/tickets/${action}`, { method: 'POST', body: JSON.stringify({ ticketId: activeTicket._id }) });
      setActiveTicket(result.data); await loadTickets(); showToast(result.message || 'Atendimento atualizado.');
      return true;
    } catch (err) {
      await loadTickets({ showLoading: false }).catch(() => {});
      showToast(err.message, 'error');
      return false;
    }
  };
  const toggle = () => updateTicket(activeTicket.status === 'open' ? 'unclaim' : 'claim');
  const close = async () => { if (await updateTicket('close')) { setActiveTicket(null); setMessages([]); } };
  const closeView = async () => {
    const ticket = activeTicket;
    setActiveTicket(null);
    setMessages([]);
    await discardTemporaryTicket(ticket);
  };

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  const totalUnread = Object.values(unreadByTicket).reduce((total, unread) => total + unread.count, 0);
  useEffect(() => {
    document.title = totalUnread ? `(${totalUnread}) SNG Chat` : 'SNG Chat';
  }, [totalUnread]);

  if (initializing || !serverAvailable) {
    return <div className="app-loading" role="status" aria-live="polite"><div className="loading-mark"><div className="loading-spinner" /><img src={logo} alt="SNG" /></div><span>Conectando ao servidor...</span></div>;
  }

  return <div className="app-shell">
    {agent && <Sidebar {...{ tab, setTab, agent, connected, collapsed, setCollapsed, logout }} />}
    {agent && tab === 'tickets' && <main className={`conversations-layout ${activeTicket ? 'has-active-ticket' : ''}`}><TicketList {...{ tickets, loading: ticketsLoading, activeId: activeTicket?._id, agentId: agent._id, unreadByTicket, onSelect: selectTicket, reload: loadTickets, onNewConversation: startConversation, theme, setTheme }} /><ChatPanel ticket={activeTicket} messages={messages} unreadMarker={unreadMarker} contactOnline={contactOnline} hasOlderMessages={hasOlderMessages} loadingOlderMessages={loadingOlderMessages} onLoadOlder={loadOlderMessages} onSend={send} onFile={sendFile} onToggle={toggle} onClose={close} onBack={closeView} onOpenImage={setViewer} /></main>}
    {agent && tab === 'dashboard' && <Dashboard connected={connected} qr={qr} />}
    {agent && tab === 'settings' && <Settings agent={agent} onAgentChange={setAgent} />}
    {!agent && <LoginModal onLogin={login} notice={authNotice} />}
    {viewer && <div className="media-viewer" onClick={() => setViewer('')}><button><i className="fa-solid fa-xmark" /></button><img src={viewer} alt="Visualização da mídia" /></div>}
    {toast && <div className={`app-toast ${toast.type}`} role="status"><i className={`fa-solid ${toast.type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}`} /><span>{toast.message}</span><button type="button" onClick={() => setToast(null)} aria-label="Fechar aviso"><i className="fa-solid fa-xmark" /></button></div>}
  </div>;
}
