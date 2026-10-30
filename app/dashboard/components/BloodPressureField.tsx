import React, { useId } from 'react'
import { BP_FORM_MARKER, bpFormFieldsFromRow, bpLevel, type BpHistoryRow } from '@/utils/bloodPressure'
import { formatDateShortHN } from '@/utils/datetime'

/**
 * Presión arterial con brazo (izquierdo/derecho) y la opción «Tomar en ambos brazos». Para todos
 * los tenants; con `required` (clínica con require_bp_arm y paciente no pediátrico) se marca como
 * obligatoria, pero la regla la valida el servidor.
 *
 * Con `history` muestra al lado el historial de tomas (Nueva Consulta usa BpHistoryTable aparte,
 * alineada con este campo): se ven las 3 más recientes y las anteriores con scroll.
 *
 * Campos NO controlados a propósito: el borrador local y la pre-clínica en vivo escriben directo
 * en el DOM. Mostrar/ocultar según «ambos brazos» lo hace el CSS (:has) en globals.css.
 */
export default function BloodPressureField({ required, defaults, history }: {
  required: boolean
  defaults?: { blood_pressure?: string | null; blood_pressure_left?: string | null; blood_pressure_right?: string | null } | null
  history?: BpHistoryRow[]
}) {
  const id = useId()
  const initial = bpFormFieldsFromRow(defaults ?? {})

  return (
    <fieldset className={history?.length ? 'bp-field bp-field--con-historial' : 'bp-field'}>
      <input type="hidden" name={BP_FORM_MARKER} value="1" />
      <legend className="bp-legend">
        Presión Arterial
        {required && <span className="bp-required" aria-hidden="true"> *</span>}
        {required && <span className="bp-hint">Obligatoria en adultos</span>}
      </legend>

      <div className="bp-captura">
      <div className="bp-row">
        <div className="form-group bp-reading">
          <label className="form-label" htmlFor={`${id}-main`}>
            <span className="bp-only-single">Lectura (mmHg)</span>
            <span className="bp-only-both">Brazo izquierdo (mmHg)</span>
          </label>
          <input id={`${id}-main`} className="form-input" name="blood_pressure" placeholder="Ej. 120/80" defaultValue={initial.blood_pressure} />
        </div>

        <div className="form-group bp-only-single" role="radiogroup" aria-labelledby={`${id}-arm`}>
          <span id={`${id}-arm`} className="form-label">Brazo</span>
          <div className="bp-segmented">
            <label>
              <input type="radio" name="blood_pressure_arm" value="left" defaultChecked={initial.blood_pressure_arm === 'left'} />
              Izquierdo
            </label>
            <label>
              <input type="radio" name="blood_pressure_arm" value="right" defaultChecked={initial.blood_pressure_arm === 'right'} />
              Derecho
            </label>
          </div>
        </div>

        <div className="form-group bp-reading bp-only-both">
          <label className="form-label" htmlFor={`${id}-second`}>Brazo derecho (mmHg)</label>
          <input id={`${id}-second`} className="form-input" name="blood_pressure_second" placeholder="Ej. 125/82" defaultValue={initial.blood_pressure_second} />
        </div>
      </div>

      <label className="bp-both-toggle">
        <input type="checkbox" name="blood_pressure_both" defaultChecked={initial.blood_pressure_both === 'on'} />
        Tomar en ambos brazos
      </label>
      </div>

      {!!history?.length && <BpHistoryTable rows={history} />}
    </fieldset>
  )
}

/** Valor de una celda, coloreado por nivel (verde < 120/80, ámbar elevada, rojo ≥ 140/90). */
function Lectura({ value }: { value: string | null }) {
  if (!value) return <span className="bp-hist-vacio">—</span>
  const nivel = bpLevel(value)
  return <span className={nivel ? `bp-hist-valor bp-nivel-${nivel}` : 'bp-hist-valor'}>{value}</span>
}

export function BpHistoryTable({ rows, titulo = 'Historial' }: { rows: BpHistoryRow[]; titulo?: string }) {
  return (
    <section className="bp-historial" aria-label="Historial de presión arterial">
      <div className="bp-historial-cabecera">
        <span className="bp-historial-titulo">{titulo}</span>
        <span className="bp-historial-leyenda">
          <span><i className="bp-marca bp-marca-normal" aria-hidden="true" />&lt; 120/80</span>
          <span><i className="bp-marca bp-marca-elevada" aria-hidden="true" />120–139 / 80–89</span>
          <span><i className="bp-marca bp-marca-alta" aria-hidden="true" />≥ 140/90</span>
        </span>
      </div>
      {rows.length === 0 ? <p className="bp-historial-vacio">Sin registros anteriores.</p> : (
      <div className="bp-historial-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">No especificado</th>
              <th scope="col">Izquierdo</th>
              <th scope="col">Derecho</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="bp-hist-fecha">{formatDateShortHN(r.createdAt)}</td>
                <td><Lectura value={r.sinBrazo} /></td>
                <td><Lectura value={r.izquierdo} /></td>
                <td><Lectura value={r.derecho} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </section>
  )
}
