import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

export default function Dashboard({ connected, qr }) {
  const [qrImage, setQrImage] = useState('');
  useEffect(() => {
    if (!qr) {
      setQrImage('');
      return;
    }
    QRCode.toDataURL(qr, { width: 240, margin: 1 }).then(setQrImage);
  }, [qr]);
  const content = connected ? (
    <>
      <i className="fa-solid fa-circle-check" />
      <h2>WhatsApp conectado</h2>
      <p>A API está pronta para enviar e receber mensagens.</p>
    </>
  ) : qrImage ? (
    <>
      <h2>Conectar ao WhatsApp</h2>
      <img src={qrImage} alt="QR Code do WhatsApp" />
      <p>Abra o WhatsApp › Aparelhos conectados › Conectar um aparelho</p>
    </>
  ) : (
    <>
      <i className="fa-solid fa-arrows-rotate" />
      <h2>Aguardando QR Code</h2>
      <p>O cliente WhatsApp está sendo inicializado. Esta tela será atualizada automaticamente.</p>
    </>
  );
  return (
    <main className="page dashboard">
      <header>
        <h1>Status da conexão</h1>
        <p>Escaneie o QR Code ou verifique a conexão com o WhatsApp.</p>
      </header>
      <section className="card status-card">{content}</section>
    </main>
  );
}
