import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { formatPhone } from '../utils/phone';

export default function GroupMembersDialog({ chat, onClose }) {
  const dialog = useRef(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api(`/tickets/${chat._id}/members`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setMembers(result.data);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [chat._id, attempt]);
  const filtered = members.filter((member) =>
    `${member.name} ${member.phoneNumber}`
      .toLocaleLowerCase('pt-BR')
      .includes(search.toLocaleLowerCase('pt-BR')),
  );
  return (
    <dialog
      className="card group-members-dialog"
      ref={dialog}
      aria-labelledby="group-members-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h2 id="group-members-title">Membros do grupo</h2>
          <p>{chat.contactName}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar membros do grupo">
          <i className="fa-solid fa-xmark" />
        </button>
      </header>
      {loading ? (
        <p role="status">Carregando membros...</p>
      ) : error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          <label className="member-search">
            Buscar membro
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome ou telefone"
            />
          </label>
          <p className="member-count">{members.length} membros</p>
          <ul>
            {filtered.map((member) => (
              <li key={member.id}>
                <span className="member-initial">
                  {(member.name || '?').slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>
                    {member.name ||
                      (member.phoneNumber
                        ? formatPhone(member.phoneNumber)
                        : 'Participante sem nome')}
                  </strong>
                  {member.name && member.phoneNumber && (
                    <small>{formatPhone(member.phoneNumber)}</small>
                  )}
                </div>
                {member.isAdmin && <em>Admin</em>}
              </li>
            ))}
          </ul>
          {!filtered.length && <p>Nenhum membro encontrado.</p>}
        </>
      )}
    </dialog>
  );
}
