'use client'

import React, { useId, useState } from 'react'
import { Maximize2, Minimize2, Clock, Copy } from 'lucide-react'
import { formatDateShortHN } from '@/utils/datetime'

/** Cuadro de texto obligatorio de la consulta (controlado) con «Ampliar». */
export function TextoAmpliable({ name, etiqueta, placeholder, value, onChange }: {
  name: string
  etiqueta: string
  placeholder: string
  value: string
  onChange: (v: string) => void
}) {
  const id = useId()
  const [ampliado, setAmpliado] = useState(false)
  return (
    <div className={ampliado ? 'dx-campo dx-campo--ampliado' : 'dx-campo'}>
      <div className="dx-campo-cabecera">
        <label htmlFor={id} className="evo-label">{etiqueta} <span className="evo-requerido">*</span></label>
        <button type="button" className="nota-clinica-ampliar" onClick={() => setAmpliado((a) => !a)} aria-expanded={ampliado} aria-controls={id}>
          {ampliado ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
          {ampliado ? 'Reducir' : 'Ampliar'}
        </button>
      </div>
      <textarea id={id} className="form-input" name={name} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={5} required />
    </div>
  )
}

/** Tarjeta «Último diagnóstico / plan» con el botón para copiarlo a esta consulta. */
export function ReferenciaAnterior({ titulo, fecha, valor, onUsar }: {
  titulo: string
  fecha?: string | null
  valor?: string | null
  onUsar: () => void
}) {
  return (
    <section className="dx-ref" aria-label={titulo}>
      <div className="dx-ref-cabecera">
        <Clock size={20} color="#64748b" aria-hidden="true" />
        <div>
          <span className="dx-ref-titulo">{titulo}</span>
          {fecha && <span className="dx-ref-fecha">{formatDateShortHN(fecha)}</span>}
        </div>
      </div>
      {valor ? (
        <>
          <p className="dx-ref-valor">{valor}</p>
          <button type="button" className="dx-ref-usar" onClick={onUsar}>
            <Copy size={16} aria-hidden="true" /> Usar en esta consulta
          </button>
        </>
      ) : (
        <p className="bp-historial-vacio" style={{ padding: 0 }}>Sin registros anteriores.</p>
      )}
    </section>
  )
}
