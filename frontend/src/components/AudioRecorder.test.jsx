import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import AudioRecorder from './AudioRecorder';

let stopTrack;
let getUserMedia;
class Recorder {
  static isTypeSupported = () => true;
  constructor() { this.state = 'inactive'; this.mimeType = 'audio/ogg;codecs=opus'; }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable({ data: new Blob(['audio'], { type: this.mimeType }) });
    this.onstop();
  }
}
beforeEach(() => {
  stopTrack = vi.fn();
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  vi.stubGlobal('MediaRecorder', Recorder);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  URL.createObjectURL = vi.fn(() => 'blob:audio');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());
const start = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
  await screen.findByRole('button', { name: 'Parar gravação' });
};
const stop = () => fireEvent.click(screen.getByRole('button', { name: 'Parar gravação' }));

describe('AudioRecorder', () => {
  it('grava, libera microfone e permite ouvir antes de enviar', async () => {
    const onSend = vi.fn().mockResolvedValue({});
    render(<AudioRecorder onSend={onSend} />);
    await start();
    stop();
    expect(stopTrack).toHaveBeenCalled();
    expect(screen.getByLabelText('Prévia do áudio')).toHaveAttribute('src', 'blob:audio');
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar áudio' }));
    await screen.findByRole('button', { name: 'Gravar áudio' });
    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend.mock.calls[0][0]).toBeInstanceOf(File);
    expect(onSend.mock.calls[0][0].type).toBe('audio/ogg;codecs=opus');
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:audio'));
  });
  it('mantém gravação quando envio falha para tentar novamente', async () => {
    const onSend = vi.fn().mockRejectedValueOnce(new Error('Sem conexão')).mockResolvedValueOnce({});
    render(<AudioRecorder onSend={onSend} />);
    await start(); stop();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar áudio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão');
    expect(screen.getByLabelText('Prévia do áudio')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar áudio' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
  });
  it('descarta gravação sem enviar', async () => {
    const onSend = vi.fn();
    render(<AudioRecorder onSend={onSend} />);
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar áudio' }));
    expect(stopTrack).toHaveBeenCalled();
    expect(screen.queryByLabelText('Prévia do áudio')).not.toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
  });
  it('libera microfone quando sai da conversa', async () => {
    const { unmount } = render(<AudioRecorder onSend={vi.fn()} />);
    await start(); unmount();
    expect(stopTrack).toHaveBeenCalled();
  });
  it('libera permissão recebida após sair da conversa', async () => {
    let resolve;
    getUserMedia.mockReturnValue(new Promise(done => { resolve = done; }));
    const { unmount } = render(<AudioRecorder onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
    unmount();
    await act(async () => resolve({ getTracks: () => [{ stop: stopTrack }] }));
    expect(stopTrack).toHaveBeenCalled();
  });
  it('informa quando permissão é negada', async () => {
    getUserMedia.mockRejectedValue({ name: 'NotAllowedError' });
    render(<AudioRecorder onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Permita o acesso ao microfone');
  });
});
