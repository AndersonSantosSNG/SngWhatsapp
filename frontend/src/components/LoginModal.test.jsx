import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LoginModal from './LoginModal';

describe('LoginModal', () => {
  it('exibe aviso de sessão expirada', () => {
    render(<LoginModal onLogin={vi.fn()} notice="Entre novamente." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Sessão expirada');
    expect(screen.getByRole('alert')).toHaveTextContent('Entre novamente.');
  });

  it('envia credenciais e apresenta erro', async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error('Credenciais inválidas'));
    render(<LoginModal onLogin={onLogin} />);
    fireEvent.change(screen.getByLabelText('E-mail corporativo'), { target: { value: 'agente@sng.com.br' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('agente@sng.com.br', 'senha'));
    expect(await screen.findByText('Credenciais inválidas')).toBeVisible();
  });
});
