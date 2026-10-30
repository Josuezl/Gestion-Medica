'use client'

import React, { useId, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'

/**
 * Tarjeta de una nota opcional de la consulta (Sintomatología, Resultados de estudios) con
 * «Ampliar» para escribir con más espacio. El texto es NO controlado (lo usa el borrador local);
 * ampliar solo cambia la altura del cuadro.
 */
export default function NotaClinica({ name, titulo, descripcion, placeholder, icono }: {
  name: string
  titulo: string
  descripcion: string
  placeholder: string
  icono: React.ReactNode
}) {
  const id = useId()
  const [ampliada, setAmpliada] = useState(false)
  return (
    <div className={ampliada ? 'nota-clinica nota-clinica--ampliada' : 'nota-clinica'}>
      <div className="nota-clinica-cabecera">
        {icono}
        <div>
          <label htmlFor={id} className="nota-clinica-titulo">{titulo}</label>
          <span className="nota-clinica-descripcion">{descripcion}</span>
        </div>
        <span className="nota-clinica-opcional">Opcional</span>
      </div>
      <button type="button" className="nota-clinica-ampliar" onClick={() => setAmpliada((a) => !a)} aria-expanded={ampliada} aria-controls={id}>
        {ampliada ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
        {ampliada ? 'Reducir' : 'Ampliar'}
      </button>
      <textarea id={id} className="form-input" name={name} placeholder={placeholder} rows={5} />
    </div>
  )
}
