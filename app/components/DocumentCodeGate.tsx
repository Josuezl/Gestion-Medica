'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Portal público de acceso por código para documentos con membrete (incapacidad/referencia, orden de
 * laboratorio, solicitud de estudios). Réplica del de /prescriptions/view, generalizado: al enviar,
 * navega a `${basePath}?code=...${extraQuery}`. No revela datos del documento (minimización).
 */
export default function DocumentCodeGate({ basePath, extraQuery = '', hasError, defaultValue = '', docLabel = 'Documento' }: {
  basePath: string
  extraQuery?: string
  hasError: boolean
  defaultValue?: string
  docLabel?: string
}) {
  const [code, setCode] = useState(defaultValue)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => { if (hasError) setLoading(false) }, [hasError])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const sanitized = code.trim().toUpperCase().replace(/[–—]/g, '-')
    router.push(`${basePath}?code=${encodeURIComponent(sanitized)}${extraQuery}`)
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '440px', width: '100%', backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', padding: '40px 30px', boxSizing: 'border-box', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(13, 148, 136, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', color: '#0d9488' }}>
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h3 style={{ margin: '0 0 6px 0', fontSize: '12px', fontWeight: 800, color: '#0d9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Portal de Pacientes
        </h3>
        <h1 style={{ margin: '0 0 12px 0', fontSize: '22px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
          Acceso Seguro al {docLabel}
        </h1>
        <p style={{ margin: '0 0 24px 0', fontSize: '13.5px', color: '#64748b', lineHeight: 1.5 }}>
          Por motivos de privacidad y seguridad médica, introduzca el código de acceso proporcionado por su médico para ver el documento.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              Código de Acceso
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[–—]/g, '-'))}
              placeholder="XXX-XXXXXX"
              required
              disabled={loading}
              style={{ width: '100%', padding: '14px 16px', fontSize: '18px', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em', textAlign: 'center', borderRadius: '8px', border: hasError ? '2px solid #ef4444' : '1px solid #cbd5e1', outline: 'none', color: '#0f172a', backgroundColor: '#f8fafc', boxSizing: 'border-box' }}
            />
            {hasError && (
              <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>
                Código incorrecto. Verifique el código e intente de nuevo.
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: 'white', border: 'none', padding: '14px 20px', borderRadius: '8px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontSize: '14px', letterSpacing: '0.02em', boxShadow: '0 4px 6px -1px rgba(13, 148, 136, 0.15)', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Validando...' : 'Ver Documento'}
          </button>
        </form>

        <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '30px', paddingTop: '20px', width: '100%', fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>
          <p style={{ margin: '0' }}>Esta página está protegida con cifrado SSL de extremo a extremo.</p>
          <p style={{ margin: '4px 0 0 0' }}>Desarrollado de conformidad con la ley de protección de datos médicos.</p>
        </div>
      </div>
    </div>
  )
}
