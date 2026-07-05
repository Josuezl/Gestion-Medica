/**
 * Lógica pura del banner de saludo del dashboard.
 * Honduras es UTC-6 fijo (sin horario de verano): la hora local se obtiene restando 6h al instante UTC.
 */
import { personShortName, doctorShortName } from './doctorName'

const HN_OFFSET_MIN = 6 * 60

/** Partes (año, mes, día, hora) del calendario local de Honduras para un instante dado. */
function hondurasParts(now: Date): { y: number; m: number; d: number; h: number } {
  const hn = new Date(now.getTime() - HN_OFFSET_MIN * 60_000)
  return { y: hn.getUTCFullYear(), m: hn.getUTCMonth(), d: hn.getUTCDate(), h: hn.getUTCHours() }
}

export type Greeting = 'Buenos días' | 'Buenas tardes' | 'Buenas noches'

/** Franja de saludo según la hora local de Honduras: días (5–11), tardes (12–18), noches (19–4). */
export function greetingForHonduras(now: Date): Greeting {
  const { h } = hondurasParts(now)
  if (h >= 5 && h < 12) return 'Buenos días'
  if (h >= 12 && h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Roles que se saludan como médico: llevan título "Dr./Dra." y ven su día de citas. */
export function isDoctorRole(role?: string | null): boolean {
  return role === 'DOCTOR' || role === 'ADMIN'
}

/**
 * Nombre a mostrar en el saludo. Los médicos llevan título según su género;
 * el personal (asistente/enfermería) solo el nombre.
 */
export function greetingName(
  role: string | null | undefined,
  firstName?: string | null,
  lastName?: string | null,
  gender?: string | null,
): string {
  return isDoctorRole(role)
    ? doctorShortName(firstName, lastName, gender)
    : personShortName(firstName, lastName)
}

/**
 * Rango [inicio, fin) del día de Honduras expresado en ISO UTC, para filtrar columnas timestamptz.
 * La medianoche de Honduras equivale a las 06:00 UTC del mismo día.
 */
export function hondurasDayRangeUTC(now: Date): { startISO: string; endISO: string } {
  const { y, m, d } = hondurasParts(now)
  const startISO = new Date(Date.UTC(y, m, d, HN_OFFSET_MIN / 60, 0, 0)).toISOString()
  const endISO = new Date(Date.UTC(y, m, d + 1, HN_OFFSET_MIN / 60, 0, 0)).toISOString()
  return { startISO, endISO }
}
