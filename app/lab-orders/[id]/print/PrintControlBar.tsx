'use client'

import React from 'react'

export default function PrintControlBar() {
  return (
    <div className="control-bar no-print">
      <h2 className="control-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: '#0d9488', width: '16px', height: '16px' }}>
          <path d="M9 2v6l-5 9a2 2 0 0 0 1.8 3h12.4a2 2 0 0 0 1.8-3l-5-9V2" />
          <path d="M7 2h10" />
        </svg>
        Vista Previa — Orden de Laboratorio
      </h2>
      <div className="control-buttons">
        <button className="btn-print" onClick={() => window.print()}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
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
