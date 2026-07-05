/**
 * Validaciones puras (sin BD ni red), centralizadas para poder probarlas y reutilizarlas.
 * Las server actions delegan aquí en vez de tener la lógica embebida (más testeable, menos
 * duplicación). Cubre los signos vitales y el estado de cita (hallazgos A4/A5/M2).
 */

export interface VitalsInput {
  temperature?: number | null
  weight?: number | null
  height?: number | null
  headCircumference?: number | null
  heartRate?: number | null
  respiratoryRate?: number | null
  oxygenSaturation?: number | null
}

interface VitalRange {
  key: keyof VitalsInput
  label: string
  min: number
  max: number
  unit: string
}

/** Rangos médicos razonables; caben holgadamente en las columnas numéricas de la BD. */
export const VITAL_RANGES: VitalRange[] = [
  { key: 'temperature', label: 'Temperatura', min: 25, max: 45, unit: '°C' },
  { key: 'weight', label: 'Peso', min: 0.2, max: 600, unit: 'kg' },
  { key: 'height', label: 'Talla', min: 10, max: 280, unit: 'cm' },
  { key: 'headCircumference', label: 'Perímetro cefálico', min: 10, max: 80, unit: 'cm' },
  { key: 'heartRate', label: 'Ritmo cardiaco', min: 10, max: 400, unit: 'bpm' },
  { key: 'respiratoryRate', label: 'Frecuencia respiratoria', min: 3, max: 80, unit: 'rpm' },
  { key: 'oxygenSaturation', label: 'SpO2', min: 1, max: 100, unit: '%' },
]

/**
 * Devuelve un mensaje de error si algún signo vital está fuera de rango, o `null` si todo OK.
 * Los valores `null`/`undefined` (no ingresados) se ignoran.
 */
export function validateVitals(v: VitalsInput): string | null {
  for (const r of VITAL_RANGES) {
    const value = v[r.key]
    if (value === null || value === undefined) continue
    if (Number.isNaN(value) || value < r.min || value > r.max) {
      return `Revisa los signos vitales: el valor de ${r.label} (${value}) no es válido. Debe estar entre ${r.min} y ${r.max} ${r.unit}.`
    }
  }
  return null
}

/**
 * Estados válidos de una cita. Deben coincidir con STATUS_CONFIG (UI) y el CHECK de la BD.
 * PENDING_REVIEW = solicitud del portal público de auto-agendamiento: bloquea el slot pero
 * requiere aprobación del staff en /dashboard/solicitudes (no se crea desde la agenda).
 */
export const VALID_APPOINTMENT_STATUSES = ['PENDING', 'CONFIRMED', 'WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'PENDING_REVIEW'] as const
export type AppointmentStatus = (typeof VALID_APPOINTMENT_STATUSES)[number]

export function isValidAppointmentStatus(status: string): boolean {
  return (VALID_APPOINTMENT_STATUSES as readonly string[]).includes(status)
}

/**
 * Estados permitidos al CREAR una cita. Solo los previos o en curso: "Pendiente", "Confirmada",
 * "En sala de espera" y "En consulta" (p. ej. el médico en turno de noche, sin asistente, crea la
 * cita ya "En consulta"). Se excluyen COMPLETED/NO_SHOW/CANCELLED: describen algo que ocurre después
 * y no tiene sentido crear una cita ya en esos estados (además, COMPLETED exige una consulta
 * registrada, que una cita nueva no puede tener). Se asignan luego con el dropdown de la tarjeta.
 */
export const CREATABLE_APPOINTMENT_STATUSES = ['PENDING', 'CONFIRMED', 'WAITING', 'IN_PROGRESS'] as const

export function isCreatableAppointmentStatus(status: string): boolean {
  return (CREATABLE_APPOINTMENT_STATUSES as readonly string[]).includes(status)
}

/**
 * Normaliza un nombre de persona de origen NO confiable (p. ej. extraído por IA del mensaje de
 * WhatsApp): deja solo letras (con acentos), espacios y `.'-`, colapsa espacios y limita la
 * longitud. Devuelve `fallback` si no queda nada útil (hallazgo M6 / calidad de datos).
 */
export function sanitizeName(raw: string | null | undefined, fallback = 'Paciente'): string {
  const cleaned = (raw || '')
    .replace(/[^\p{L}\p{M}\s.'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  return cleaned || fallback
}

/**
 * Normaliza un nombre para COMPARAR (no para mostrar): quita acentos/marcas, pasa a minúsculas,
 * deja solo letras/números/espacios y colapsa espacios. Sirve para detectar pacientes duplicados
 * de forma robusta a acentos, mayúsculas y espacios extra. Ej.: "  José  PÉREZ " → "jose perez".
 */
export function normalizeName(raw: string | null | undefined): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita los diacríticos (acentos)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Fila candidata de paciente (misma clínica + misma fecha de nacimiento) para detectar duplicados. */
export interface DuplicateCandidate {
  id: string
  first_name: string | null
  last_name: string | null
  birth_date: string | null
  gender: string | null
}

/** Resultado de la detección de duplicado. `block=true` => bloqueo (no se permite registrar). */
export interface DuplicateMatch {
  id: string
  name: string
  birthDate: string | null
  block: boolean
}

/**
 * Decide si alguno de los `candidates` (que ya comparten la MISMA fecha de nacimiento y clínica que
 * el paciente que se quiere registrar) es un duplicado, comparando el nombre normalizado.
 *
 * - Mismo nombre + mismo género => `block: true` (duplicado casi seguro: bloqueo, no se puede saltar).
 *   Es exactamente el caso de dos capturas del mismo paciente (mismo nombre, fecha y género).
 * - Mismo nombre pero género distinto => `block: false` (aviso, se puede confirmar y guardar).
 * - Ningún nombre coincide (p. ej. gemelos con otro nombre) => `null`.
 *
 * Si hay varios candidatos que coinciden por nombre, prefiere el de bloqueo (género igual).
 * Función pura (sin BD) para poder probarla; la server action hace la consulta y delega aquí.
 */
export function classifyNameDobDuplicate(
  candidates: DuplicateCandidate[],
  firstName: string,
  lastName: string,
  gender: string,
): DuplicateMatch | null {
  const target = normalizeName(`${firstName} ${lastName}`)
  if (!target) return null

  let warning: DuplicateMatch | null = null
  for (const c of candidates) {
    if (normalizeName(`${c.first_name ?? ''} ${c.last_name ?? ''}`) !== target) continue
    const match: DuplicateMatch = {
      id: c.id,
      name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.replace(/\s+/g, ' ').trim(),
      birthDate: c.birth_date,
      block: c.gender === gender,
    }
    if (match.block) return match // bloqueo: el más fuerte, se devuelve de inmediato
    warning = warning ?? match    // aviso: lo recordamos por si no aparece un bloqueo
  }
  return warning
}

/**
 * Sanitiza un término de búsqueda antes de interpolarlo en un filtro `.or()` de PostgREST.
 *
 * En la sintaxis de `or=`, `,` separa condiciones y `(` `)` `"` agrupan/citan: si llegan en el
 * texto del usuario rompen la consulta (400) o alteran el filtro. `%` `_` `*` son comodines de
 * LIKE/PostgREST que el usuario no debe controlar. Se eliminan todos y se colapsan espacios.
 */
export function sanitizeSearchTerm(term: string): string {
  return term
    .replace(/[,()"'\\%_*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
