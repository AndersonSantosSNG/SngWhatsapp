const colors = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0891b2', '#16a34a', '#ca8a04', '#4f46e5', '#be123c', '#0d9488'];

function avatarColor(ticket) {
  const seed = String(ticket._id || ticket.phoneNumber || ticket.contactName || 'avatar');
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

export default function Avatar({ ticket, large = false }) {
  const color = avatarColor(ticket);
  const [photo, setPhoto] = useState('');
  useEffect(() => {
    if (!ticket._id) return undefined;
    const controller = new AbortController();
    let objectUrl = '';
    const url = `/api/tickets/${encodeURIComponent(ticket._id)}/profile-picture?v=${new Date(ticket.updatedAt || 0).getTime()}`;
    fetch(url, { signal: controller.signal })
      .then(response => response.ok && response.status !== 204 ? response.blob() : null)
      .then(blob => {
        if (!blob || controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPhoto(objectUrl);
      })
      .catch(() => {});
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ticket._id, ticket.updatedAt]);
  return (
    <div className={`avatar ${large ? 'avatar-large' : ''}`} style={{ '--avatar-color': color }}>
      {!photo && <i className={`fa-solid ${ticket.isGroup ? 'fa-users' : 'fa-user'}`} />}
      {photo && <img className="loaded" src={photo} alt="" />}
    </div>
  );
}
import { useEffect, useState } from 'react';
