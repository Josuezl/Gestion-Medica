import type { PreclinicalVitalsRow } from '@/utils/clinicalTypes'

/**
 * Decide qué hacer cuando llegan signos de pre-clínica mientras el médico ya tiene abierta la
 * pantalla de Nueva Consulta.
 *
 * Regla única: NUNCA se pisa lo que escribió el médico. Lo que el sistema autollenó sí se
 * puede reemplazar (así una corrección de la asistente llega sola). Función pura, sin DOM ni
 * React, para poder probarla; el componente se encarga de leer y escribir los inputs.
 */

/**
 * Freno del respaldo: mínimo entre reconsultas al volver a la pestaña. Solo aplica cuando el
 * canal de Realtime está caído; con el canal sano no se consulta nada.
 */
export const PRECLINICAL_FALLBACK_MS = 15_000

/** Campos que comparten la pre-clínica y el formulario de consulta, por su atributo `name`. */
export const VITALS_FIELDS = [
  'blood_pressure',
  'temperature',
  'weight',
  'height',
  'head_circumference',
  'heart_rate',
  'respiratory_rate',
  'oxygen_saturation',
] as const

export type VitalsFieldName = (typeof VITALS_FIELDS)[number]
export type VitalsValues = Record<VitalsFieldName, string>

export type PreclinicalDecision = {
  /** `autofill`: escribir los valores. `offer`: ofrecerlos con un botón. `none`: no hacer nada. */
  action: 'autofill' | 'offer' | 'none'
  values: VitalsValues
}

/** Los valores de la fila como texto, tal como los esperan los inputs del formulario. */
export function vitalsFromPreclinical(row: PreclinicalVitalsRow): VitalsValues {
  const out = {} as VitalsValues
  for (const field of VITALS_FIELDS) {
    const value = row[field]
    // `?? ''` y no `|| ''`: un 0 es un valor medido, no un vacío.
    out[field] = value === null || value === undefined ? '' : String(value)
  }
  return out
}

/** ¿La sección de signos está intacta? Un `0` cuenta como escrito; los espacios no. */
export function isVitalsBlank(values: VitalsValues): boolean {
  return VITALS_FIELDS.every((field) => (values[field] ?? '').trim() === '')
}

function sameVitals(a: VitalsValues, b: VitalsValues): boolean {
  return VITALS_FIELDS.every((field) => (a[field] ?? '').trim() === (b[field] ?? '').trim())
}

export function decidePreclinicalUpdate({
  current,
  incoming,
  lastApplied,
}: {
  /** Lo que hay ahora mismo en los inputs. */
  current: VitalsValues
  /** La fila de pre-clínica que acaba de llegar. */
  incoming: PreclinicalVitalsRow
  /** Los valores que este mismo componente autollenó antes, si lo hizo. */
  lastApplied: VitalsValues | null
}): PreclinicalDecision {
  const values = vitalsFromPreclinical(incoming)

  // Una fila sin un solo signo no tiene nada que aportar: ni se llena ni se ofrece.
  if (isVitalsBlank(values)) return { action: 'none', values }

  // Formulario intacto, o intacto desde que nosotros lo llenamos: se puede escribir.
  const untouched = isVitalsBlank(current) || (lastApplied !== null && sameVitals(current, lastApplied))
  return { action: untouched ? 'autofill' : 'offer', values }
}
