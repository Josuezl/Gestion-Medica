import React, { useId } from 'react'
import { BP_FORM_MARKER, bpFormFieldsFromRow } from '@/utils/bloodPressure'

/**
 * Presión arterial con brazo (izquierdo/derecho) y la opción «Tomar en ambos brazos». Para todos
 * los tenants; con `required` (clínica con require_bp_arm y paciente no pediátrico) se marca como
 * obligatoria, pero la regla la valida el servidor.
 *
 * Campos NO controlados a propósito: el borrador local y la pre-clínica en vivo escriben directo
 * en el DOM. Mostrar/ocultar según «ambos brazos» lo hace el CSS (:has) en globals.css.
 */
export default function BloodPressureField({ required, defaults }: {
  required: boolean
  defaults?: { blood_pressure?: string | null; blood_pressure_left?: string | null; blood_pressure_right?: string | null } | null
}) {
  const id = useId()
  const initial = bpFormFieldsFromRow(defaults ?? {})

  return (
    <fieldset className="bp-field">
      <input type="hidden" name={BP_FORM_MARKER} value="1" />
      <legend className="bp-legend">
        Presión Arterial
        {required && <span className="bp-required" aria-hidden="true"> *</span>}
        {required && <span className="bp-hint">Obligatoria en adultos</span>}
      </legend>

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
    </fieldset>
  )
}
