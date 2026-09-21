import { useState } from 'react';
import { api } from '../services/api';

function ForgotPasswordModal({ onClose }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetToken, setResetToken] = useState('');

  const requestCode = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ corporateEmail: email }),
      });
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setLoading(true);
    setError('');
    try {
      const result = await api('/auth/verify-reset-code', {
        method: 'POST',
        body: JSON.stringify({ corporateEmail: email, code: data.get('code') }),
      });
      setResetToken(result.resetToken);
      setStep('password');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') || '');
    if (password !== data.get('confirmPassword')) {
      setError('As senhas não são iguais.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ corporateEmail: email, resetToken, password }),
      });
      setStep('success');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-backdrop password-reset-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-reset-title"
    >
      <form
        className="card login-card password-reset-card"
        onSubmit={step === 'email' ? requestCode : step === 'code' ? verifyCode : resetPassword}
      >
        <button
          type="button"
          className="password-reset-close"
          onClick={onClose}
          aria-label="Fechar"
        >
          <i className="fa-solid fa-xmark" />
        </button>
        <div className="login-title">
          <i className={`fa-solid ${step === 'success' ? 'fa-circle-check' : 'fa-key'}`} />
          <h2 id="password-reset-title">
            {step === 'email' && 'Esqueci minha senha'}
            {step === 'code' && 'Informe o código'}
            {step === 'password' && 'Crie uma nova senha'}
            {step === 'success' && 'Senha redefinida'}
          </h2>
          <p>
            {step === 'email' && 'Digite seu e-mail corporativo para receber um código.'}
            {step === 'code' &&
              `Enviamos um código de 6 dígitos para ${email}. Ele vale por 30 minutos.`}
            {step === 'password' && 'Código validado. Agora defina sua nova senha de acesso.'}
            {step === 'success' && 'Sua senha foi alterada. Você já pode entrar no painel.'}
          </p>
        </div>
        {step === 'email' && (
          <label>
            E-mail corporativo
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </label>
        )}
        {step === 'code' && (
          <label>
            Código de 6 dígitos
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength="6"
              placeholder="000000"
              required
              autoFocus
            />
          </label>
        )}
        {step === 'password' && (
          <>
            <label>
              Nova senha
              <input
                name="password"
                type="password"
                minLength="10"
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              Confirmar nova senha
              <input
                name="confirmPassword"
                type="password"
                minLength="10"
                autoComplete="new-password"
                required
              />
            </label>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {step !== 'success' && (
          <button className="submit-button" disabled={loading}>
            {loading
              ? 'Aguarde...'
              : step === 'email'
                ? 'Enviar código'
                : step === 'code'
                  ? 'Validar código'
                  : 'Redefinir senha'}
          </button>
        )}
        {step === 'code' && (
          <button
            type="button"
            className="password-reset-link"
            onClick={() => {
              setStep('email');
              setError('');
            }}
            disabled={loading}
          >
            Reenviar código
          </button>
        )}
        {step === 'success' && (
          <button type="button" className="submit-button" onClick={onClose}>
            Voltar ao login
          </button>
        )}
      </form>
    </div>
  );
}

export default function LoginModal({ onLogin, notice }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      await onLogin(data.get('email'), data.get('password'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <form className="card login-card" onSubmit={submit}>
        {notice && (
          <div className="session-feedback" role="alert">
            <i className="fa-solid fa-clock-rotate-left" />
            <div>
              <strong>Sessão expirada</strong>
              <span>{notice}</span>
            </div>
          </div>
        )}
        <div className="login-title">
          <i className="fa-solid fa-headset" />
          <h2>Entrar como agente</h2>
          <p>Use seu e-mail corporativo e senha.</p>
        </div>
        <label>
          E-mail corporativo
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Senha
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        <button
          type="button"
          className="password-reset-link"
          onClick={() => setForgotPassword(true)}
        >
          Esqueci minha senha
        </button>
        {error && <p className="form-error">{error}</p>}
        <button className="submit-button" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
      {forgotPassword && <ForgotPasswordModal onClose={() => setForgotPassword(false)} />}
    </div>
  );
}
