'use client'

import React, { useId } from 'react'
import { autoCrecer } from '@/utils/autoCrecer'

/**
 * Tarjeta de una nota opcional de la consulta (Sintomatología, Resultados de estudios). El cuadro
 * crece con lo escrito. El texto es NO controlado (lo usa el borrador local).
 */
export default function NotaClinica({ name, titulo, descripcion, placeholder, icono }: {
  name: string
  titulo: string
  descripcion: string
  placeholder: string
  icono: React.ReactNode
}) {
  const id = useId()
  return (
    <div className="nota-clinica">
      <div className="nota-clinica-cabecera">
        {icono}
        <div>
          <label htmlFor={id} className="nota-clinica-titulo">{titulo}</label>
          <span className="nota-clinica-descripcion">{descripcion}</span>
        </div>
        <span className="nota-clinica-opcional">Opcional</span>
      </div>
      <textarea id={id} className="form-input auto-crece" name={name} placeholder={placeholder} rows={5} onInput={autoCrecer} />
    </div>
  )
}
