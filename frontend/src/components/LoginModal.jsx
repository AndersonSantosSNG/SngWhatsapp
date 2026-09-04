import { useState } from 'react';

export default function LoginModal({ onLogin, notice }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async event => {
    event.preventDefault(); setLoading(true); setError('');
    const data = new FormData(event.currentTarget);
    try { await onLogin(data.get('email'), data.get('password')); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };
  return <div className="modal-backdrop"><form className="card login-card" onSubmit={submit}>{notice && <div className="session-feedback" role="alert"><i className="fa-solid fa-clock-rotate-left" /><div><strong>Sessão expirada</strong><span>{notice}</span></div></div>}<div className="login-title"><i className="fa-solid fa-headset" /><h2>Entrar como agente</h2><p>Use seu e-mail corporativo e senha.</p></div><label>E-mail corporativo<input name="email" type="email" required autoComplete="username" /></label><label>Senha<input name="password" type="password" required autoComplete="current-password" /></label>{error && <p className="form-error">{error}</p>}<button className="submit-button" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button></form></div>;
}
