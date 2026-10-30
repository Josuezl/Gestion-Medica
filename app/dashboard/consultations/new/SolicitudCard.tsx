'use client'

import React from 'react'
import { FileText, Plus } from 'lucide-react'
import { formatDateHN } from '@/utils/datetime'

/**
 * Tarjeta de «Laboratorio y Estudios» en Nueva Consulta: qué se ha seleccionado en esta consulta y,
 * si existe, la última solicitud del paciente para importarla.
 */
export default function SolicitudCard({ icono, titulo, descripcion, vacio, botonTexto, cantidad, unidades, onAbrir, onQuitar, lista, ultima }: {
  icono: React.ReactNode
  titulo: string
  descripcion: string
  vacio: string
  botonTexto: string
  cantidad: number
  unidades: [string, string]
  onAbrir: () => void
  onQuitar: () => void
  lista: React.ReactNode
  ultima?: { fecha: string; etiqueta: string; lista: React.ReactNode; onImportar: () => void } | null
}) {
  return (
    <section className="sol-card" aria-label={titulo}>
      <div className="sol-cabecera">
        <span className="sol-icono" aria-hidden="true">{icono}</span>
        <div>
          <span className="sol-titulo">{titulo}</span>
          <span className="sol-descripcion">{descripcion}</span>
        </div>
      </div>

      {cantidad === 0 ? (
        <>
          <p className="sol-vacio"><FileText size={16} aria-hidden="true" /> {vacio}</p>
          <button type="button" className="sol-boton" onClick={onAbrir}>
            <Plus size={18} aria-hidden="true" /> {botonTexto}
          </button>
        </>
      ) : (
        <div className="sol-seleccion">
          <div className="sol-seleccion-cabecera">
            <span className="sol-cantidad">{cantidad} {cantidad === 1 ? unidades[0] : unidades[1]}</span>
            <div className="sol-acciones">
              <button type="button" className="btn btn-secondary" onClick={onAbrir}>Editar</button>
              <button type="button" className="btn btn-secondary" onClick={onQuitar}>Quitar</button>
            </div>
          </div>
          {lista}
        </div>
      )}

      {ultima && (
        <div className="sol-ultima">
          <div className="sol-ultima-cabecera">
            <span className="sol-ultima-etiqueta">{ultima.etiqueta} · {formatDateHN(ultima.fecha)}</span>
            <button type="button" className="sol-importar" onClick={ultima.onImportar}>Importar</button>
          </div>
          {ultima.lista}
        </div>
      )}
    </section>
  )
}
