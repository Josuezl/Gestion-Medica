'use client'

import React from 'react'

export default function PrintControlBar() {
  return (
    <div className="control-bar no-print">
      <h2 className="control-title">
        <svg className="vital-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: '#0d9488', width: '16px', height: '16px' }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        Vista Previa de Receta Médica
      </h2>
      <div className="control-buttons">
        <button className="btn-print" onClick={() => window.print()}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          Imprimir / Guardar PDF
        </button>
        <button className="btn-close" onClick={() => window.close()}>
          Cerrar Vista
        </button>
      </div>
    </div>
  )
}
