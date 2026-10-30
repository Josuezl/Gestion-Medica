'use client'

import React, { useState } from 'react'

const VISIBLES = 3

/**
 * Zona con scroll de los historiales (3 filas visibles). Con más registros, el borde inferior se
 * desvanece para indicar que hay más abajo; al llegar al final se ve completo.
 */
export default function HistorialScroll({ total, children }: { total: number; children: React.ReactNode }) {
  const [alFinal, setAlFinal] = useState(false)

  function alDesplazar(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    setAlFinal(el.scrollTop + el.clientHeight >= el.scrollHeight - 4)
  }

  return (
    <div className={`bp-historial-scroll${total > VISIBLES && !alFinal ? ' hay-mas' : ''}`} onScroll={alDesplazar}>
      {children}
    </div>
  )
}
