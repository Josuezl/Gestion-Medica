'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatDateTimeHN } from '@/utils/datetime'
import type { Cara, Denticion, EstadoOdontograma, Region } from '@/utils/odontograma'
import { rutaNuevaConsulta } from '@/utils/rutaConsulta'
import Odontograma, { descripcion, ubicacion } from './components/Odontograma'

export type OdontogramaGuardado = {
  id: string
  consultaId: string
  fecha: string
  denticion: Denticion
  estado: EstadoOdontograma | null
}

function listaDeMarcas(estado: EstadoOdontograma) {
  const marcas: { lugar: string; detalle: string }[] = []

  for (const [numero, pieza] of Object.entries(estado.piezas)) {
    const fdi = Number(numero)
    const detalle = descripcion(pieza.pieza, pieza.nota)
    if (detalle) marcas.push({ lugar: ubicacion({ nivel: 'pieza', fdi }), detalle })

    for (const [cara, marca] of Object.entries(pieza.caras ?? {})) {
      const detalleCara = descripcion(marca)
      if (detalleCara) marcas.push({ lugar: ubicacion({ nivel: 'cara', fdi, cara: cara as Cara }), detalle: detalleCara })
    }
  }

  for (const [region, marca] of Object.entries(estado.regiones)) {
    const detalle = descripcion(marca, marca?.nota)
    if (detalle) marcas.push({ lugar: ubicacion({ nivel: 'region', region: region as Region }), detalle })
  }
  return marcas
}

export default function OdontogramaTab({ patientId, historial, isDentist }: {
  patientId: string
  historial: OdontogramaGuardado[] | null
  isDentist: boolean
}) {
  const [seleccionId, setSeleccionId] = useState<string>()
  const seleccionado = historial?.find(({ id }) => id === seleccionId) ?? historial?.[0]
  const marcas = seleccionado?.estado ? listaDeMarcas(seleccionado.estado) : []

  return (
    <section style={{ minWidth: 0, display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', justifyContent: 'space-between', gap: '0.75rem' }}>
        {seleccionado && (
          <label>
            <span className="form-label">Fecha del odontograma</span>
            <select className="form-input" value={seleccionado.id} onChange={(event) => setSeleccionId(event.target.value)}>
              {historial?.map(({ id, fecha }, indice) => (
                <option key={id} value={id}>
                  {formatDateTimeHN(fecha)}{indice === 0 ? ' (Actual)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          {seleccionado && (
            <a className="btn btn-secondary" href={`/consultations/${seleccionado.consultaId}/print/plan-trabajo`} target="_blank" rel="noopener noreferrer">
              Imprimir plan de trabajo
            </a>
          )}
          {isDentist && (
            <Link className="btn btn-primary" href={rutaNuevaConsulta(patientId, null, true)}>Nueva consulta dental</Link>
          )}
        </div>
      </div>

      {seleccionado?.estado ? (
        <>
          <Odontograma estado={seleccionado.estado} denticion={seleccionado.denticion} soloLectura />
          <div>
            <h3>Hallazgos y notas</h3>
            {marcas.length > 0 ? (
              <ul style={{ paddingLeft: '1.25rem', display: 'grid', gap: '0.35rem', overflowWrap: 'anywhere' }}>
                {marcas.map(({ lugar, detalle }) => (
                  <li key={lugar}><strong>{lugar}</strong> · {detalle}</li>
                ))}
              </ul>
            ) : <p>Este odontograma no tiene hallazgos ni notas.</p>}
          </div>
        </>
      ) : (
        <p>{historial === null || seleccionado
          ? 'No se pudo cargar el odontograma.'
          : 'Este paciente todavía no tiene odontogramas guardados.'}</p>
      )}
    </section>
  )
}
