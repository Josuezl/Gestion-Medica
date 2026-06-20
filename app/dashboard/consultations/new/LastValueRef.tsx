'use client'

import React from 'react'

/** Tarjeta de referencia con el último valor (diagnóstico/plan) + botón "Importar". */
export function LastValueRef({ label, value, onUse }: { label: string; value: string; onUse: () => void }) {
  return (
    <div style={{ marginTop: '0.5rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '1rem', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#0f766e', backgroundColor: 'rgba(13,148,136,0.12)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>{label}</span>
        <button type="button" onClick={onUse} style={{ flexShrink: 0, background: 'none', border: '1px solid #99f6e4', color: '#0d9488', borderRadius: '6px', padding: '0.15rem 0.6rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Importar</button>
      </div>
      <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{value}</p>
    </div>
  )
}
