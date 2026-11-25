import QRCode from 'qrcode'

export function generarQrVerificacion(codigo: string | null | undefined, documento?: 'referral' | 'dental') {
  const sitio = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const url = `${sitio}/verificar/${codigo}${documento ? `?doc=${documento}` : ''}`
  return QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
}

export default function PrintVerification({ codigo, qrDataUrl }: { codigo?: string | null; qrDataUrl: string }) {
  return (
    <div className="qr-box">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrDataUrl} alt="Código QR de verificación del documento" />
      <div>
        <p className="qr-cap-title">Documento verificable</p>
        <p className="qr-cap-text">Escanea el código para validar este documento en su versión digital.</p>
        <p className="qr-code">{codigo}</p>
      </div>
    </div>
  )
}
