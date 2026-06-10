'use client'

import React from 'react'

export default function PatientControlBar() {
  return (
    <div className="control-bar no-print" style={{ backgroundColor: '#0f172a' }}>
      <h2 className="control-title" style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#0d9488" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <polyline points="9 11 11 13 15 9"/>
        </svg>
        Receta Médica Digital Verificada
      </h2>
      <div className="control-buttons">
        <button className="btn-print" onClick={() => window.print()}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          Descargar / Imprimir
        </button>
      </div>
    </div>
  )
}
