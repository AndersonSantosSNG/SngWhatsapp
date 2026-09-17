export function getMessageDate(message) {
  const value = message?.sentAt || message?.timestamp || message?.createdAt;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getDateKey(message) {
  const date = getMessageDate(message);
  return date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : '';
}

export function formatDateSeparator(message) {
  const date = getMessageDate(message);
  if (!date) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((today - messageDay) / 86400000);
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  if (days > 1 && days < 7) return date.toLocaleDateString('pt-BR', { weekday: 'long' });
  return date.toLocaleDateString('pt-BR');
}
