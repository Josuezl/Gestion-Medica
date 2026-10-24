'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { INTERVALO_VERSION_MS } from '@/utils/appVersion'
import { EVENTO_VERSION_NUEVA, verificarVersion } from '@/utils/versionCheck'
import { guardarRespaldoFormularios, restaurarRespaldoFormularios } from '@/utils/respaldoFormularios'

const RECUPERADO_MS = 8000

// En `next dev` no hay version.json del build actual: el vigilante solo corre en producción.
const ACTIVO = process.env.NODE_ENV === 'production'

/**
 * Vigilante global de versión nueva (montado en app/layout.tsx; no depende de sesión, así que
 * también cubre el portal público). Tras un despliegue en Vercel una pestaña vieja ya no puede
 * llamar a las Server Actions: al navegar se recarga sola; en los demás casos avisa y el botón
 * «Actualizar» guarda lo escrito antes de recargar.
 */
export default function AvisoVersionNueva() {
  const pathname = usePathname()
  const rutaAnterior = useRef<string | null>(null)
  const [hayVersionNueva, setHayVersionNueva] = useState(false)
  const [recuperado, setRecuperado] = useState(false)

  useEffect(() => {
    if (!ACTIVO) return
    const alAvisar = () => setHayVersionNueva(true)
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') void verificarVersion('foco')
    }
    const alFallar = () => void verificarVersion('fallo_guardado')
    const intervalo = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void verificarVersion('intervalo')
    }, INTERVALO_VERSION_MS)

    window.addEventListener(EVENTO_VERSION_NUEVA, alAvisar)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    window.addEventListener('unhandledrejection', alFallar)

    let ocultar: number | undefined
    void restaurarRespaldoFormularios().then((lleno) => {
      if (!lleno) return
      setRecuperado(true)
      ocultar = window.setTimeout(() => setRecuperado(false), RECUPERADO_MS)
    })

    return () => {
      window.clearInterval(intervalo)
      window.clearTimeout(ocultar)
      window.removeEventListener(EVENTO_VERSION_NUEVA, alAvisar)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      window.removeEventListener('unhandledrejection', alFallar)
    }
  }, [])

  useEffect(() => {
    if (!ACTIVO) return
    if (rutaAnterior.current !== null && rutaAnterior.current !== pathname) {
      void verificarVersion('navegacion')
    }
    rutaAnterior.current = pathname
  }, [pathname])

  const actualizar = () => {
    guardarRespaldoFormularios()
    window.location.reload()
  }

  if (hayVersionNueva) {
    return (
      <div role="status" style={styles.barra}>
        <span style={styles.texto}>
          <strong>Hay una versión nueva de la aplicación.</strong>{' '}
          Pulsa Actualizar: lo que escribiste se conserva.
        </span>
        <button type="button" onClick={actualizar} style={styles.boton}>Actualizar</button>
      </div>
    )
  }

  if (recuperado) {
    return (
      <div role="status" style={{ ...styles.barra, ...styles.barraExito }}>
        <span style={styles.texto}>Recuperamos lo que escribiste. Revísalo y guarda.</span>
      </div>
    )
  }

  return null
}

const styles: Record<string, React.CSSProperties> = {
  barra: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10000,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    background: '#fef3c7',
    borderBottom: '1px solid var(--warning)',
    color: '#78350f',
    fontSize: '0.9rem',
    boxShadow: 'var(--shadow-md)',
  },
  barraExito: {
    background: '#d1fae5',
    borderBottom: '1px solid var(--success)',
    color: '#064e3b',
  },
  texto: { textAlign: 'center' },
  boton: {
    padding: '0.4rem 1rem',
    border: 'none',
    borderRadius: '0.5rem',
    background: 'var(--warning)',
    color: '#ffffff',
    fontWeight: 600,
    cursor: 'pointer',
  },
}
