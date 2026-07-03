'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface CodeFormProps {
  prescriptionId: string
  defaultValue?: string
  hasError: boolean
}

export default function CodeForm({ prescriptionId, defaultValue = '', hasError }: CodeFormProps) {
  const [code, setCode] = useState(defaultValue)
  // isPending cubre toda la navegación (ida y respuesta del servidor): si el código es
  // incorrecto y la página vuelve con hasError, el botón se rehabilita solo.
  const [loading, startNavigation] = useTransition()
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Limpiar el código antes de enviar
    const sanitizedCode = code.trim().toUpperCase().replace(/[\u2013\u2014]/g, '-')
    
    // Navegación del lado del cliente en Next.js (más fluida, no recarga la página entera)
    startNavigation(() => {
      router.push(`/prescriptions/view/${prescriptionId}?code=${encodeURIComponent(sanitizedCode)}`)
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      <div>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
          Código de Acceso de Receta
        </label>
        <input 
          type="text" 
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[\u2013\u2014]/g, '-'))}
          placeholder="MC-XXXXXX" 
          required 
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px 16px',
            fontSize: '18px',
            fontFamily: 'monospace',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textAlign: 'center',
            borderRadius: '8px',
            border: hasError ? '2px solid #ef4444' : '1px solid #cbd5e1',
            outline: 'none',
            color: '#0f172a',
            backgroundColor: '#f8fafc',
            transition: 'border-color 0.2s',
            boxSizing: 'border-box'
          }}
        />
        {hasError && (
          <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>
            Código incorrecto. Por favor, verifique el código e intente de nuevo.
          </p>
        )}
      </div>
      <button 
        type="submit" 
        disabled={loading}
        style={{
          background: 'linear-gradient(135deg, #0d9488, #0f766e)',
          color: 'white',
          border: 'none',
          padding: '14px 20px',
          borderRadius: '8px',
          fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          letterSpacing: '0.02em',
          boxShadow: '0 4px 6px -1px rgba(13, 148, 136, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          transition: 'all 0.2s',
          opacity: loading ? 0.7 : 1
        }}
      >
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none">
              <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Validando...</span>
          </div>
        ) : (
          'Ver Receta Médica'
        )}
      </button>

      {/* Definición de animación spin si no existiera */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}} />
    </form>
  )
}
