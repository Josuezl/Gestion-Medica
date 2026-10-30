'use client'

import React, { useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

const VISIBLES = 3

/**
 * Zona con scroll de los historiales (3 filas visibles). Con más registros, el borde inferior se
 * desvanece y un pie avisa cuántos hay más abajo; al llegar al final ofrece volver a las recientes.
 */
export default function HistorialScroll({ total, children }: { total: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [alFinal, setAlFinal] = useState(false)
  const ocultas = total - VISIBLES

  function alDesplazar(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    setAlFinal(el.scrollTop + el.clientHeight >= el.scrollHeight - 4)
  }

  function mover() {
    const el = ref.current
    if (!el) return
    if (alFinal) el.scrollTo({ top: 0, behavior: 'smooth' })
    else el.scrollBy({ top: el.clientHeight - 40, behavior: 'smooth' })
  }

  return (
    <>
      <div ref={ref} className={`bp-historial-scroll${ocultas > 0 && !alFinal ? ' hay-mas' : ''}`} onScroll={alDesplazar}>
        {children}
      </div>
      {ocultas > 0 && (
        <button type="button" className="historial-mas" onClick={mover}>
          {alFinal
            ? <><ChevronUp size={14} aria-hidden="true" /> Volver a las recientes</>
            : <><ChevronDown size={14} aria-hidden="true" /> Desliza para ver {ocultas} {ocultas === 1 ? 'anterior' : 'anteriores'}</>}
        </button>
      )}
    </>
  )
}
