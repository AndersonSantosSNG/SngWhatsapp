import { useEffect, useRef } from 'react';
import notificationSound from '../assets/notification.mp3';
import { socket } from '../services/socket';

export function useChatSocketEvents({
  activeChatId,
  agent,
  loadChats,
  loadWhatsAppStatus,
  setConnected,
  setMessages,
  setQr,
  setServerAvailable,
  setUnreadByChat,
  showToast,
  syncChat,
}) {
  const notificationAudio = useRef(null);

  useEffect(() => {
    const onConnect = () => {
      setServerAvailable(true);
      loadWhatsAppStatus();
      loadChats({ showLoading: false }).catch(console.error);
    };
    const onDisconnect = () => {
      setServerAvailable(false);
      setConnected(false);
      setQr('');
      showToast('Conexão com o servidor perdida. Tentando reconectar...', 'error');
    };
    const onQr = (data) => {
      setQr(data.qr);
      setConnected(false);
    };
    const onMessage = (data) => {
      const message = data.message || data;
      setConnected(true);
      if (data.chat) syncChat(data.chat);
      else loadChats({ showLoading: false }).catch(console.error);
      if (activeChatId === message.ticketId) {
        setMessages((current) =>
          current.some((item) => (item.id || item._id) === message.id)
            ? current
            : [...current, message],
        );
      }
      if (agent && !message.fromMe) {
        if (!notificationAudio.current) notificationAudio.current = new Audio(notificationSound);
        notificationAudio.current.currentTime = 0;
        notificationAudio.current.play().catch(() => {});
      }
      if (agent && !message.fromMe && activeChatId !== message.ticketId) {
        setUnreadByChat((current) => {
          const unread = current[message.ticketId];
          return {
            ...current,
            [message.ticketId]: {
              count: (unread?.count || 0) + 1,
              firstMessageId: unread?.firstMessageId || message.id,
            },
          };
        });
      }
    };
    const onAck = ({ messageId, ack }) =>
      setMessages((current) =>
        current.map((message) =>
          (message.id || message._id) === messageId ? { ...message, ack } : message,
        ),
      );
    const onEdit = ({ messageId, body, editedAt }) =>
      setMessages((current) =>
        current.map((message) =>
          String(message.id || message._id) === String(messageId)
            ? { ...message, body, editedAt }
            : message,
        ),
      );
    const onRevoke = ({ messageId, deletedAt }) =>
      setMessages((current) =>
        current.map((message) =>
          String(message.id || message._id) === String(messageId)
            ? { ...message, deletedAt }
            : message,
        ),
      );
    const onTicketEvent = (event) => {
      if (event.chat) syncChat(event.chat);
      else loadChats({ showLoading: false }).catch(console.error);
      if (activeChatId === event.ticketId) {
        setMessages((current) =>
          current.some((item) => (item.id || item._id) === event.id)
            ? current
            : [...current, event],
        );
      }
    };
    const onHistorySyncComplete = () => loadChats({ showLoading: false }).catch(console.error);
    const listeners = {
      connect: onConnect,
      disconnect: onDisconnect,
      qr_code: onQr,
      new_message: onMessage,
      message_ack: onAck,
      message_edit: onEdit,
      message_revoke: onRevoke,
      ticket_event: onTicketEvent,
      history_sync_complete: onHistorySyncComplete,
    };
    Object.entries(listeners).forEach(([event, listener]) => socket.on(event, listener));
    return () => {
      Object.entries(listeners).forEach(([event, listener]) => socket.off(event, listener));
    };
  }, [
    activeChatId,
    agent,
    loadChats,
    loadWhatsAppStatus,
    setConnected,
    setMessages,
    setQr,
    setServerAvailable,
    setUnreadByChat,
    showToast,
    syncChat,
  ]);
}
