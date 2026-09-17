import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import { formatPhone } from '../utils/phone';
import { api } from '../services/api';

export default function ContactInfoDialog({ chat, contactOnline, onClose }) {
  const dialog = useRef(null);
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const path = chat.isDraft
      ? `/contacts/info?phoneNumber=${encodeURIComponent(chat.phoneNumber)}`
      : `/tickets/${chat._id}/contact-info`;
    api(path, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setContact(result.data);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [chat._id]);

  const displayName =
    contact?.contactName ||
    chat.contactName ||
    formatPhone(contact?.phoneNumber || chat.phoneNumber);
  const business = contact?.business || {};

  return (
    <dialog
      className="card contact-info-dialog"
      ref={dialog}
      aria-labelledby="contact-info-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="contact-info-title">Informações do contato</h2>
        <button type="button" onClick={onClose} aria-label="Fechar informações do contato">
          <i className="fa-solid fa-xmark" />
        </button>
      </header>
      <div className="contact-info-profile">
        <Avatar chat={chat} />
        <div>
          <strong>{displayName}</strong>
          <span className={contactOnline ? 'contact-online' : ''}>
            {contactOnline && <i />}
            {contactOnline ? 'online' : 'offline'}
          </span>
        </div>
      </div>
      <dl>
        <div>
          <dt>Telefone</dt>
          <dd>
            {contact?.formattedNumber || formatPhone(contact?.phoneNumber || chat.phoneNumber)}
          </dd>
        </div>
        <div>
          <dt>Identificador do WhatsApp</dt>
          <dd>{contact?.whatsappId || chat.whatsappId || 'Não informado'}</dd>
        </div>
        <div>
          <dt>Situação</dt>
          <dd>
            {chat.status === 'closed'
              ? 'Encerrado'
              : chat.status === 'open'
                ? 'Em atendimento'
                : 'Pendente'}
          </dd>
        </div>
        {contact?.about && (
          <div>
            <dt>Recado</dt>
            <dd>{contact.about}</dd>
          </div>
        )}
        {contact && (
          <div>
            <dt>Tipo de conta</dt>
            <dd>{contact.isBusiness ? 'Conta comercial' : 'Conta pessoal'}</dd>
          </div>
        )}
        {business.description && (
          <div>
            <dt>Descrição comercial</dt>
            <dd>{business.description}</dd>
          </div>
        )}
        {business.categories?.length > 0 && (
          <div>
            <dt>Categorias</dt>
            <dd>{business.categories.join(', ')}</dd>
          </div>
        )}
        {business.address && (
          <div>
            <dt>Endereço</dt>
            <dd>{business.address}</dd>
          </div>
        )}
        {business.email && (
          <div>
            <dt>E-mail</dt>
            <dd>{business.email}</dd>
          </div>
        )}
      </dl>
      {loading && <p className="contact-info-state">Consultando perfil no WhatsApp...</p>}
      {error && <p className="contact-info-state error">{error}</p>}
    </dialog>
  );
}
