'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Printer, ChevronDown } from 'lucide-react'

export interface DocumentoEnlace { etiqueta: string; href: string; titulo: string }

/**
 * Menú «Documentos» del expediente: imprimir la ficha y los últimos documentos emitidos. Agrupa en
 * un solo botón lo que antes eran hasta cinco botones sueltos. Se cierra con Escape o clic afuera.
 */
export default function DocumentosMenu({ onImprimirFicha, enlaces }: {
  onImprimirFicha: () => void
  enlaces: DocumentoEnlace[]
}) {
  const [abierto, setAbierto] = useState(false)
  const raizRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (!raizRef.current?.contains(e.target as Node)) setAbierto(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  return (
    <div className="docs-menu" ref={raizRef}>
      <button
        type="button" className="btn btn-secondary exp-accion" aria-haspopup="menu" aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        <Printer size={18} /> Documentos <ChevronDown size={16} className="docs-menu-chevron" />
      </button>
      {abierto && (
        <div className="docs-menu-lista" role="menu">
          <button type="button" role="menuitem" onClick={() => { setAbierto(false); onImprimirFicha() }}>
            Imprimir ficha
          </button>
          {enlaces.map((e) => (
            <a key={e.href} role="menuitem" href={e.href} target="_blank" rel="noopener noreferrer" title={e.titulo} onClick={() => setAbierto(false)}>
              {e.etiqueta}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
