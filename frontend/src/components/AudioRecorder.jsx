import { useEffect, useRef, useState } from 'react';

export default function AudioRecorder({ onSend, disabled, hidden = false }) {
  const [phase, setPhase] = useState('idle');
  const [audio, setAudio] = useState(null);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const session = useRef(null);
  const sending = useRef(false);

  const release = (current) => {
    if (!current) return;
    current.cancelled = true;
    if (current.recorder?.state === 'recording') current.recorder.stop();
    current.stream?.getTracks().forEach((track) => track.stop());
  };
  useEffect(() => () => release(session.current), []);
  useEffect(
    () => () => {
      if (audio) URL.revokeObjectURL(audio.url);
    },
    [audio],
  );
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const discard = () => {
    release(session.current);
    session.current = null;
    setAudio(null);
    setError('');
    setPhase('idle');
  };
  const start = async () => {
    if (session.current || disabled) return;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
      setError('Para gravar áudio, use um navegador compatível e acesse por HTTPS ou localhost.');
      return;
    }
    const current = { cancelled: false, send: onSend };
    session.current = current;
    setPhase('requesting');
    try {
      current.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (current.cancelled) {
        release(current);
        return;
      }
      const mimeType = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4'].find(
        (type) => MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(current.stream, mimeType ? { mimeType } : undefined);
      current.recorder = recorder;
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (current.cancelled) return;
        release(current);
        session.current = null;
        setPhase('idle');
        setError('Não foi possível gravar o áudio. Tente novamente.');
      };
      recorder.onstop = () => {
        current.stream.getTracks().forEach((track) => track.stop());
        if (current.cancelled) return;
        const type = recorder.mimeType || chunks[0]?.type || 'audio/webm';
        const blob = new Blob(chunks, { type });
        if (!blob.size) {
          session.current = null;
          setPhase('idle');
          setError('A gravação ficou vazia. Grave novamente.');
          return;
        }
        const extension = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
        setAudio({
          file: new File([blob], `audio-${Date.now()}.${extension}`, { type }),
          url: URL.createObjectURL(blob),
        });
        setPhase('preview');
      };
      recorder.start();
      setSeconds(0);
      setPhase('recording');
    } catch (err) {
      if (current.cancelled) return;
      release(current);
      session.current = null;
      setPhase('idle');
      setError(
        err.name === 'NotAllowedError'
          ? 'Permita o acesso ao microfone no navegador para gravar áudio.'
          : 'Não foi possível acessar o microfone. Verifique se ele está conectado e disponível.',
      );
    }
  };
  const send = async () => {
    if (!audio || sending.current || disabled) return;
    sending.current = true;
    setPhase('sending');
    setError('');
    try {
      await session.current.send(audio.file);
      discard();
    } catch (err) {
      setError(err.message || 'Não foi possível enviar o áudio. Tente novamente.');
      setPhase('preview');
    } finally {
      sending.current = false;
    }
  };

  return (
    <div
      className={`audio-recorder ${phase !== 'idle' ? 'is-active' : ''}`}
      hidden={hidden && phase === 'idle'}
    >
      {phase === 'idle' ? (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          aria-label="Gravar áudio"
          title="Gravar áudio"
        >
          <i className="fa-solid fa-microphone" />
        </button>
      ) : (
        <div className="audio-recorder-controls">
          {phase === 'requesting' && <span role="status">Aguardando microfone...</span>}
          {phase === 'recording' && (
            <>
              <span className="audio-recording-status" role="status">
                <i className="fa-solid fa-circle" aria-hidden="true" />
                Gravando {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
              </span>
              <button
                className="audio-stop"
                type="button"
                onClick={() => {
                  setPhase('stopping');
                  session.current.recorder.stop();
                }}
              >
                <i className="fa-solid fa-stop" aria-hidden="true" />
                Parar gravação
              </button>
            </>
          )}
          {phase === 'stopping' && <span role="status">Preparando áudio...</span>}
          {audio && (
            <>
              <div className="audio-preview">
                <i className="fa-solid fa-wave-square audio-preview-icon" aria-hidden="true" />
                <audio controls src={audio.url} aria-label="Prévia do áudio" />
              </div>
              <button
                className="audio-send"
                type="button"
                onClick={send}
                disabled={phase === 'sending' || disabled}
              >
                <i
                  className={`fa-solid ${phase === 'sending' ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}
                  aria-hidden="true"
                />
                <span>{phase === 'sending' ? 'Enviando áudio...' : 'Enviar áudio'}</span>
              </button>
            </>
          )}
          <button
            className="audio-discard"
            type="button"
            onClick={discard}
            disabled={phase === 'sending'}
            aria-label="Descartar áudio"
            title="Descartar áudio"
          >
            <i className="fa-regular fa-trash-can" aria-hidden="true" />
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
