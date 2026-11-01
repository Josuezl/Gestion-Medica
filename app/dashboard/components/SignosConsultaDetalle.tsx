import React from 'react'
import { bpLevel, bpReadings } from '@/utils/bloodPressure'
import type { ConsultationRow } from '@/utils/clinicalTypes'

const BRAZO: Record<string, string> = { left: 'Brazo izquierdo', right: 'Brazo derecho' }

function Dato({ etiqueta, valor, unidad }: { etiqueta: string; valor: number | string | null | undefined; unidad: string }) {
  const vacio = valor === null || valor === undefined || String(valor).trim() === ''
  return (
    <div className="vs-dato">
      <span className="vs-dato-etiqueta">{etiqueta}</span>
      {vacio ? <span className="bp-hist-vacio">—</span> : <strong>{valor} <span className="vs-dato-unidad">{unidad}</span></strong>}
    </div>
  )
}

/**
 * Signos tomados en ESTA consulta, en el expediente. Sin históricos: cada consulta del expediente
 * ya muestra los suyos, así que la tabla de tomas anteriores se repetía.
 */
export default function SignosConsultaDetalle({ consult, pediatrico }: {
  consult: ConsultationRow
  pediatrico: boolean
}) {
  const lecturas = bpReadings(consult)
  return (
    <section className="vs-detalle" aria-label="Signos vitales de la consulta">
      <h4 className="vs-detalle-titulo">Signos vitales</h4>
      <div className="vs-detalle-grid">
        <fieldset className="bp-field vs-solo-lectura">
          <legend className="bp-legend">Presión arterial</legend>
          {lecturas.length === 0 ? <p className="bp-historial-vacio">No se registró.</p> : (
            <div className="vs-campos">
              {lecturas.map((l) => (
                <div key={l.arm ?? 'x'} className="vs-dato">
                  <span className="vs-dato-etiqueta">{l.arm ? BRAZO[l.arm] : 'Presión'}</span>
                  <strong className={`vs-pa vs-pa--${bpLevel(l.value) ?? 'x'}`}>{l.value} <span className="vs-dato-unidad">mmHg</span></strong>
                </div>
              ))}
            </div>
          )}
        </fieldset>
        <fieldset className="bp-field vs-solo-lectura">
          <legend className="bp-legend">Otros signos vitales</legend>
          <div className="vs-campos">
            <Dato etiqueta="Temperatura" valor={consult.temperature} unidad="°C" />
            <Dato etiqueta="Peso" valor={consult.weight} unidad="kg" />
            <Dato etiqueta="Talla" valor={consult.height} unidad="cm" />
            {pediatrico && <Dato etiqueta="Perímetro cefálico" valor={consult.head_circumference} unidad="cm" />}
            <Dato etiqueta="Frecuencia cardíaca" valor={consult.heart_rate} unidad="lpm" />
            <Dato etiqueta="Frecuencia respiratoria" valor={consult.respiratory_rate} unidad="rpm" />
            <Dato etiqueta="SpO₂" valor={consult.oxygen_saturation} unidad="%" />
          </div>
        </fieldset>
      </div>
    </section>
  )
}
