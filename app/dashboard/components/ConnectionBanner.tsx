'use client'

import { useEffect, useState } from 'react'
import { Wifi, WifiOff } from 'lucide-react'

/**
 * Aviso en vivo del estado de la conexión. Los eventos online/offline del navegador son
 * indicativos (puede haber falsos "online" con wifi sin internet), pero cubren el caso típico:
 * se cae la conexión mientras el médico llena un formulario largo. La señal definitiva de un
 * fallo sigue siendo el error del fetch al guardar.
 */
export default function ConnectionBanner() {
  const [status, setStatus] = useState<'online' | 'offline' | 'restored'>('online')

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) setStatus('offline')
    const goOffline = () => setStatus('offline')
    const goOnline = () => setStatus('restored')
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  // "Conexión restablecida" se oculta solo a los 4 segundos.
  useEffect(() => {
    if (status !== 'restored') return
    const t = setTimeout(() => setStatus('online'), 4000)
    return () => clearTimeout(t)
  }, [status])

  if (status === 'online') return null

  const offline = status === 'offline'
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.6rem 1.1rem',
        borderRadius: '999px',
        fontSize: '0.85rem',
        fontWeight: 600,
        boxShadow: '0 8px 24px rgba(15,23,42,0.25)',
        backgroundColor: offline ? '#7f1d1d' : '#065f46',
        color: '#ffffff',
        maxWidth: 'calc(100vw - 2rem)',
      }}
    >
      {offline ? <WifiOff size={16} style={{ flexShrink: 0 }} /> : <Wifi size={16} style={{ flexShrink: 0 }} />}
      {offline
        ? 'Sin conexión — tus cambios se están respaldando en este dispositivo'
        : 'Conexión restablecida'}
    </div>
  )
}
