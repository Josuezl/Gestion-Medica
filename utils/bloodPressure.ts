import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Presión arterial por brazo. Funciones puras (salvo `isBloodPressureRequired`) compartidas por el
 * formulario de consulta, la pre-clínica, el guardado en servidor y las vistas de historial.
 *
 * En el formulario:
 *   - `blood_pressure`         lectura principal (en modo «ambos brazos» es el izquierdo)
 *   - `blood_pressure_arm`     radio 'left' | 'right' (solo cuenta con un brazo)
 *   - `blood_pressure_both`    checkbox «Tomar en ambos brazos» ('on' o vacío)
 *   - `blood_pressure_second`  brazo derecho en modo «ambos brazos»
 *   - `blood_pressure_form`    marca oculta: el formulario ya trae brazo. Sin ella (pestaña de
 *                              antes del despliegue) se guarda como siempre, sin exigir nada.
 */

export const BP_FORM_MARKER = 'blood_pressure_form'

export type BpArm = 'left' | 'right'

export interface BpFormValues {
  reading: string
  arm: BpArm | ''
  both: boolean
  second: string
}

export interface BpRecord {
  blood_pressure: string | null
  blood_pressure_left: string | null
  blood_pressure_right: string | null
}

type BpRowLike = {
  blood_pressure?: string | null
  blood_pressure_left?: string | null
  blood_pressure_right?: string | null
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim()
}

/** Lee los campos de presión del formulario; null si el formulario no los trae (versión vieja). */
export function bpFormValuesFromFormData(formData: FormData): BpFormValues | null {
  if (!formData.has(BP_FORM_MARKER)) return null
  const arm = formData.get('blood_pressure_arm')
  return {
    reading: clean(formData.get('blood_pressure') as string | null),
    arm: arm === 'left' || arm === 'right' ? arm : '',
    both: formData.get('blood_pressure_both') === 'on',
    second: clean(formData.get('blood_pressure_second') as string | null),
  }
}

/** Convierte lo que llenó el usuario en las columnas de la base. */
export function bpRecordFromForm(values: BpFormValues): BpRecord {
  const reading = clean(values.reading) || null
  if (values.both) {
    const second = clean(values.second) || null
    return { blood_pressure: reading ?? second, blood_pressure_left: reading, blood_pressure_right: second }
  }
  return {
    blood_pressure: reading,
    blood_pressure_left: reading && values.arm === 'left' ? reading : null,
    blood_pressure_right: reading && values.arm === 'right' ? reading : null,
  }
}

/** Valores de los campos del formulario a partir de una fila guardada (consulta o pre-clínica). */
export function bpFormFieldsFromRow(row: BpRowLike): {
  blood_pressure: string
  blood_pressure_arm: BpArm | ''
  blood_pressure_both: 'on' | ''
  blood_pressure_second: string
} {
  const left = clean(row.blood_pressure_left)
  const right = clean(row.blood_pressure_right)
  if (left && right) return { blood_pressure: left, blood_pressure_arm: '', blood_pressure_both: 'on', blood_pressure_second: right }
  if (left) return { blood_pressure: left, blood_pressure_arm: 'left', blood_pressure_both: '', blood_pressure_second: '' }
  if (right) return { blood_pressure: right, blood_pressure_arm: 'right', blood_pressure_both: '', blood_pressure_second: '' }
  return { blood_pressure: clean(row.blood_pressure), blood_pressure_arm: '', blood_pressure_both: '', blood_pressure_second: '' }
}

/** Regla de Centro Neurológico (o cualquier clínica con `require_bp_arm`). null = válido. */
export function validateBloodPressure(values: BpFormValues, required: boolean): string | null {
  if (!required) return null
  if (values.both) {
    if (!clean(values.reading) && !clean(values.second)) return 'Registra la presión arterial de al menos un brazo.'
    return null
  }
  if (!clean(values.reading)) return 'La presión arterial es obligatoria para pacientes adultos.'
  if (!values.arm) return 'Indica en qué brazo se tomó la presión arterial.'
  return null
}

export interface BpReading {
  /** 'left' / 'right', o null en registros sin brazo (antiguos o de otros tenants). */
  arm: BpArm | null
  value: string
}

/** Lecturas para mostrar en historial e impresión. */
export function bpReadings(row: BpRowLike): BpReading[] {
  const left = clean(row.blood_pressure_left)
  const right = clean(row.blood_pressure_right)
  if (left || right) {
    const out: BpReading[] = []
    if (left) out.push({ arm: 'left', value: left })
    if (right) out.push({ arm: 'right', value: right })
    return out
  }
  const bp = clean(row.blood_pressure)
  return bp ? [{ arm: null, value: bp }] : []
}

/** Etiqueta corta para chips: «PA BI», «PA BD» o «PA». */
export function bpShortLabel(arm: BpArm | null): string {
  return arm === 'left' ? 'PA BI' : arm === 'right' ? 'PA BD' : 'PA'
}

/**
 * ¿Esta clínica exige presión con brazo para este paciente? Solo con `clinics.require_bp_arm` y
 * paciente no pediátrico. Si la columna aún no existe (SQL pendiente) la consulta falla y se trata
 * como no obligatorio.
 */
export async function isBloodPressureRequired(supabase: SupabaseClient, clinicId: string, patientId: string): Promise<boolean> {
  const [{ data: clinic }, { data: patient }] = await Promise.all([
    supabase.from('clinics').select('require_bp_arm').eq('id', clinicId).maybeSingle(),
    supabase.from('patients').select('is_pediatric').eq('id', patientId).eq('clinic_id', clinicId).maybeSingle(),
  ])
  const requireArm = (clinic as { require_bp_arm?: boolean | null } | null)?.require_bp_arm === true
  const pediatric = (patient as { is_pediatric?: boolean | null } | null)?.is_pediatric === true
  return requireArm && !pediatric
}
