import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api, deleteMessage, editMessage, sendMessage } from './services/api';
import Sidebar from './components/Sidebar';
import ChatList from './components/ChatList';
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
  const [tab, setTab] = useState('chats');
  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [contactOnline, setContactOnline] = useState(false);
  const [unreadByChat, setUnreadByChat] = useState({});
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
      setActiveChat(null);
      setMessages([]);
      setAuthNotice(event.detail?.message || 'Sua sessão expirou. Entre novamente para continuar.');
    };
    window.addEventListener('session-expired', handleSessionExpired);
    return () => window.removeEventListener('session-expired', handleSessionExpired);
  }, []);
  const loadChats = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setChatsLoading(true);
    try {
      setChats((await api('/tickets')).data);
    } finally {
      if (showLoading) setChatsLoading(false);
    }
  }, []);
  const syncChat = useCallback(ticket => {
    if (!ticket?._id) return;
    const ticketId = String(ticket._id);
    setChats(current => {
      const found = current.some(item => String(item._id) === ticketId);
      const next = found
        ? current.map(item => String(item._id) === ticketId ? { ...item, ...ticket } : item)
        : [ticket, ...current];
      return next.sort((a, b) => new Date(b.lastMessageAt || b.updatedAt || 0) - new Date(a.lastMessageAt || a.updatedAt || 0));
    });
    setActiveChat(current => String(current?._id || '') === ticketId ? { ...current, ...ticket } : current);
  }, []);
  const loadWhatsAppStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/qr');
      const result = await response.json();
      setConnected(Boolean(result.connected));
      if (result.qr) setQr(result.qr);
      else if (!result.connected) setQr('');
    } catch { setConnected(false); }
  }, []);
  const discardTemporaryChat = async ticket => {
    if (!ticket?.isTemporary) return false;
    try {
      const result = await api('/tickets/discard-temporary', { method: 'POST', body: JSON.stringify({ ticketId: ticket._id }) });
      if (result.discarded) setChats(current => current.filter(item => item._id !== ticket._id));
      return Boolean(result.discarded);
    } catch (err) {
      console.error('Não foi possível descartar a conversa temporária:', err);
      return false;
    }
  };
  const selectChat = async ticket => {
    if (activeChat?._id !== ticket._id) await discardTemporaryChat(activeChat);
    const unread = unreadByChat[ticket._id] || null;
    setActiveChat(ticket);
    setMessages([]);
    setUnreadMarker(unread);
    setUnreadByChat(current => {
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
    if (!activeChat || !messages.length || loadingOlderMessages) return;
    setLoadingOlderMessages(true);
    try {
      const oldest = messages[0].timestamp || messages[0].createdAt;
      const result = await api(`/tickets/${activeChat._id}/messages?limit=100&before=${encodeURIComponent(oldest)}`);
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
        await Promise.allSettled([loadChats(), loadWhatsAppStatus()]);
      } catch {
        storage.remove('agentAuthToken');
        if (active) setAgent(null);
      } finally {
        if (active) setInitializing(false);
      }
    };

    initialize();
    return () => { active = false; };
  }, [loadChats, loadWhatsAppStatus]);

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
    const onConnect = () => { setServerAvailable(true); loadWhatsAppStatus(); loadChats({ showLoading: false }).catch(console.error); };
    const onDisconnect = () => { setServerAvailable(false); setConnected(false); setQr(''); showToast('Conexão com o servidor perdida. Tentando reconectar...', 'error'); };
    const onQr = data => { setQr(data.qr); setConnected(false); };
    const onMessage = data => {
      const message = data.message || data;
      setConnected(true);
      if (data.chat) syncChat(data.chat);
      else loadChats({ showLoading: false }).catch(console.error);
      if (activeChat?._id === message.ticketId) setMessages(current => current.some(item => (item.id || item._id) === message.id) ? current : [...current, message]);
      if (agent && !message.fromMe && activeChat?._id !== message.ticketId) {
        setUnreadByChat(current => {
          const unread = current[message.ticketId];
          return { ...current, [message.ticketId]: { count: (unread?.count || 0) + 1, firstMessageId: unread?.firstMessageId || message.id } };
        });
      }
    };
    const onAck = ({ messageId, ack }) => setMessages(current => current.map(message => (message.id || message._id) === messageId ? { ...message, ack } : message));
    const onEdit = ({ messageId, body, editedAt }) => setMessages(current => current.map(message => String(message.id || message._id) === String(messageId) ? { ...message, body, editedAt } : message));
    const onRevoke = ({ messageId, deletedAt }) => setMessages(current => current.map(message => String(message.id || message._id) === String(messageId) ? { ...message, deletedAt } : message));
    const onTicketEvent = event => {
      if (event.chat) syncChat(event.chat);
      else loadChats({ showLoading: false }).catch(console.error);
      if (activeChat?._id === event.ticketId) setMessages(current => current.some(item => (item.id || item._id) === event.id) ? current : [...current, event]);
    };
    const onHistorySyncComplete = () => loadChats({ showLoading: false }).catch(console.error);
    socket.on('connect', onConnect); socket.on('disconnect', onDisconnect); socket.on('qr_code', onQr); socket.on('new_message', onMessage); socket.on('message_ack', onAck); socket.on('message_edit', onEdit); socket.on('message_revoke', onRevoke); socket.on('ticket_event', onTicketEvent); socket.on('history_sync_complete', onHistorySyncComplete);
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('qr_code', onQr); socket.off('new_message', onMessage); socket.off('message_ack', onAck); socket.off('message_edit', onEdit); socket.off('message_revoke', onRevoke); socket.off('ticket_event', onTicketEvent); socket.off('history_sync_complete', onHistorySyncComplete); };
  }, [activeChat?._id, agent?._id, loadChats, loadWhatsAppStatus, syncChat]);

  useEffect(() => {
    if (!agent || tab !== 'dashboard') return undefined;
    loadWhatsAppStatus();
    const interval = setInterval(loadWhatsAppStatus, 3000);
    return () => clearInterval(interval);
  }, [agent, tab, loadWhatsAppStatus]);

  useEffect(() => {
    setContactOnline(false);
    if (!agent || !activeChat || activeChat.isGroup) return undefined;

    let active = true;
    const loadPresence = async () => {
      try {
        const contactId = activeChat.whatsappId || activeChat.phoneNumber;
        const result = await api(`/whatsapp/presence?contactId=${encodeURIComponent(contactId)}&phoneNumber=${encodeURIComponent(activeChat.phoneNumber || '')}`);
        if (active) setContactOnline(result.data?.isOnline === true);
      } catch {
        if (active) setContactOnline(false);
      }
    };

    loadPresence();
    const interval = setInterval(loadPresence, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [agent, activeChat?._id, activeChat?.isGroup, activeChat?.phoneNumber, activeChat?.whatsappId]);

  const login = async (corporateEmail, password) => { const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ corporateEmail, password }) }); storage.set('agentAuthToken', result.token); socket.auth = { token: result.token }; socket.connect(); setAuthNotice(''); setAgent(result.data); await loadChats(); };
  const logout = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch {} socket.disconnect(); storage.remove('agentAuthToken'); setUnreadByChat({}); setUnreadMarker(null); setAgent(null); };
  const send = (message, replyToMessageId, { isClosingMessage = false } = {}) => sendMessage({ number: activeChat.phoneNumber, message, replyToMessageId, isClosingMessage });
  const edit = (messageId, body) => editMessage(messageId, body);
  const remove = messageId => deleteMessage(messageId);
  const startConversation = async number => {
    const result = await api('/tickets/start', { method: 'POST', body: JSON.stringify({ phoneNumber: number }) });
    console.log('[NOVA CONVERSA][PAYLOAD WHATSAPP]', result.whatsappPayload);
    await loadChats({ showLoading: false });
    await selectChat({ ...result.data, contactName: result.data.contactName || result.data.name });
  };
  const sendFile = async (file, caption, replyToMessageId, sendAudioAsVoice = false) => { const number = activeChat.phoneNumber; const data = await file.arrayBuffer(); let binary = ''; new Uint8Array(data).forEach(byte => { binary += String.fromCharCode(byte); }); await sendMessage({ number, sendAudioAsVoice, message: caption, replyToMessageId, fileBase64: btoa(binary), mimeType: file.type, fileName: file.name }); };
  const updateChat = async action => {
    try {
      const result = await api(`/tickets/${action}`, { method: 'POST', body: JSON.stringify({ ticketId: activeChat._id }) });
      syncChat(result.data); showToast(result.message || 'Atendimento atualizado.');
      return true;
    } catch (err) {
      await loadChats({ showLoading: false }).catch(() => {});
      showToast(err.message, 'error');
      return false;
    }
  };
  const toggle = () => updateChat(activeChat.status === 'open' ? 'unclaim' : 'claim');
  const close = async () => { const closed = await updateChat('close'); if (closed) { setActiveChat(null); setMessages([]); } return closed; };
  const createGlpiTicket = async (title, messageIds, attachmentMessageIds) => {
    const result = await api(`/tickets/${activeChat._id}/glpi`, { method: 'POST', body: JSON.stringify({ title, messageIds, attachmentMessageIds }) });
    showToast(result.message, result.data.failedAttachments?.length ? 'error' : 'success');
    return result.data;
  };
  const closeView = async () => {
    const ticket = activeChat;
    setActiveChat(null);
    setMessages([]);
    await discardTemporaryChat(ticket);
  };

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  const totalUnread = Object.values(unreadByChat).reduce((total, unread) => total + unread.count, 0);
  useEffect(() => {
    document.title = totalUnread ? `(${totalUnread}) SNG Chat` : 'SNG Chat';
  }, [totalUnread]);

  if (initializing || !serverAvailable) {
    return <div className="app-loading" role="status" aria-live="polite"><div className="loading-mark"><div className="loading-spinner" /><img src={logo} alt="SNG" /></div><span>Conectando ao servidor...</span></div>;
  }

  return <div className={`app-shell ${agent && tab === 'chats' && activeChat ? 'mobile-chat-open' : ''}`}>
    {agent && <Sidebar {...{ tab, setTab, agent, connected, collapsed, setCollapsed, logout }} />}
    {agent && tab === 'chats' && <main className={`conversations-layout ${activeChat ? 'has-active-chat' : ''}`}><ChatList {...{ chats: chats, loading: chatsLoading, activeId: activeChat?._id, agentId: agent._id, unreadByChat: unreadByChat, onSelect: selectChat, reload: loadChats, onNewConversation: startConversation, theme, setTheme }} /><ChatPanel chat={activeChat} messages={messages} unreadMarker={unreadMarker} contactOnline={contactOnline} hasOlderMessages={hasOlderMessages} loadingOlderMessages={loadingOlderMessages} onLoadOlder={loadOlderMessages} onSend={send} onEdit={edit} onDelete={remove} onFile={sendFile} onToggle={toggle} onClose={close} onCreateGlpiTicket={createGlpiTicket} onBack={closeView} onOpenImage={setViewer} /></main>}
    {agent && tab === 'dashboard' && <Dashboard connected={connected} qr={qr} />}
    {agent && tab === 'settings' && <Settings agent={agent} onAgentChange={setAgent} />}
    {!agent && <LoginModal onLogin={login} notice={authNotice} />}
    {viewer && <div className="media-viewer" onClick={() => setViewer('')}><button><i className="fa-solid fa-xmark" /></button><img src={viewer} alt="Visualização da mídia" /></div>}
    {toast && <div className={`app-toast ${toast.type}`} role="status"><i className={`fa-solid ${toast.type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}`} /><span>{toast.message}</span><button type="button" onClick={() => setToast(null)} aria-label="Fechar aviso"><i className="fa-solid fa-xmark" /></button></div>}
  </div>;
}
