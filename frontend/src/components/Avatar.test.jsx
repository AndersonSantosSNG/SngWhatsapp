import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Avatar from './Avatar';

describe('Avatar', () => {
  afterEach(() => vi.restoreAllMocks());

  it('abre a foto carregada no visualizador solicitado', async () => {
    const photoUrl = 'blob:profile-photo';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['photo']) }));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(photoUrl);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const onImage = vi.fn();

    render(<Avatar chat={{ _id: 'ticket-1' }} onImage={onImage} />);

    const button = await screen.findByRole('button', { name: 'Ampliar foto do perfil' });
    fireEvent.click(button);
    expect(onImage).toHaveBeenCalledWith(photoUrl, expect.any(Blob));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });
});
