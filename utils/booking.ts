import { normalizeName } from './validation'

/**
 * Lógica pura del portal público de auto-agendamiento (sin BD ni red, para poder probarla).
 *
 * Convenciones de tiempo del repo: los instantes se construyen SIEMPRE con el sufijo -06:00
 * (Honduras, sin horario de verano) y se comparan como timestamps UTC. El día de la semana se
 * calcula del string YYYY-MM-DD (nunca de `new Date('YYYY-MM-DD')`, que lo interpretaría en UTC
 * y correría el día).
 */

/** Duración fija de los slots del portal público. */
export const PORTAL_SLOT_MINUTES = 60

const HN_OFFSET_MS = 6 * 60 * 60 * 1000

/** Rango de horario semanal de un médico (fila de doctor_schedules). */
export interface ScheduleRange {
  weekday: number // 0=domingo .. 6=sábado (convención de Date.getDay())
  start_time: string // 'HH:MM' o 'HH:MM:SS' (time de Postgres)
  end_time: string
}

/** Cita existente del médico, para descontar slots ocupados. */
export interface BlockingAppointment {
  scheduled_at: string // ISO UTC
  duration_minutes: number | null
  status: string
}

/** Fecha calendario de Honduras (UTC-6 fijo) para un instante dado. */
export function hondurasTodayYMD(now: Date): string {
  return new Date(now.getTime() - HN_OFFSET_MS).toISOString().slice(0, 10)
}

/** Día de la semana (0=domingo..6=sábado) de un YYYY-MM-DD, sin efectos de zona horaria. */
export function weekdayOfYMD(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** ¿La cita ocupa el slot? Solo las canceladas y no-show lo liberan. */
export function isBlockingStatus(status: string): boolean {
  return status !== 'CANCELLED' && status !== 'NO_SHOW'
}

/** 'HH:MM' u 'HH:MM:SS' → minutos desde medianoche, o null si no parsea. */
function timeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

function minutesToHHMM(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Slots de 1 hora disponibles para un día concreto: dentro de los rangos del médico para ese
 * weekday, que quepan completos, futuros respecto a `now`, y sin solapar ninguna cita viva
 * (usa la duración real de cada cita; sin duration_minutes cuenta el default del sistema, 15).
 */
export function generateDaySlots(
  ranges: ScheduleRange[],
  dateYMD: string,
  appointments: BlockingAppointment[],
  now: Date,
): string[] {
  const weekday = weekdayOfYMD(dateYMD)
  const dayRanges = ranges.filter(r => r.weekday === weekday)
  if (dayRanges.length === 0) return []

  const busy = appointments
    .filter(a => isBlockingStatus(a.status))
    .map(a => {
      const start = new Date(a.scheduled_at).getTime()
      return { start, end: start + (a.duration_minutes ?? 15) * 60_000 }
    })

  const slots = new Set<string>()
  for (const range of dayRanges) {
    const startMin = timeToMinutes(range.start_time)
    const endMin = timeToMinutes(range.end_time)
    if (startMin === null || endMin === null) continue

    for (let t = startMin; t + PORTAL_SLOT_MINUTES <= endMin; t += PORTAL_SLOT_MINUTES) {
      const hhmm = minutesToHHMM(t)
      const slotStart = new Date(`${dateYMD}T${hhmm}:00-06:00`).getTime()
      const slotEnd = slotStart + PORTAL_SLOT_MINUTES * 60_000
      if (slotStart <= now.getTime()) continue
      if (busy.some(b => b.start < slotEnd && b.end > slotStart)) continue
      slots.add(hhmm)
    }
  }
  return [...slots].sort()
}

/**
 * Última fecha ofrecida por el portal: el último día del mes actual + 2 — una ventana de
 * 3 meses calendario (en julio se ofrece julio, agosto y septiembre completos).
 */
export function bookingWindowEndYMD(todayYMD: string): string {
  const [y, m] = todayYMD.split('-').map(Number)
  // Día 0 del mes m+3 = último día del mes m+2 (Date.UTC normaliza el cruce de año).
  return new Date(Date.UTC(y, m - 1 + 3, 0)).toISOString().slice(0, 10)
}

/** Rango de días bloqueados de un médico (vacaciones, congresos, permisos). Bordes inclusivos. */
export interface DoctorBlock {
  start_date: string // YYYY-MM-DD
  end_date: string
}

/** ¿El día cae dentro de algún bloqueo? (comparación lexicográfica de YMD, bordes inclusivos). */
export function isDateBlocked(ymd: string, blocks: DoctorBlock[]): boolean {
  return blocks.some(b => ymd >= b.start_date && ymd <= b.end_date)
}

/**
 * Disponibilidad completa para el portal: mapa YYYY-MM-DD → horas, solo con los días que tienen
 * al menos un slot, desde hoy (Honduras) hasta el fin de la ventana de 3 meses, excluyendo los
 * días bloqueados del médico (vacaciones/congresos).
 */
export function buildAvailability(
  ranges: ScheduleRange[],
  appointments: BlockingAppointment[],
  now: Date,
  blocks: DoctorBlock[] = [],
): Record<string, string[]> {
  const days: Record<string, string[]> = {}
  const todayYMD = hondurasTodayYMD(now)
  const endYMD = bookingWindowEndYMD(todayYMD)
  const [y, m, d] = todayYMD.split('-').map(Number)
  for (let i = 0; ; i++) {
    const ymd = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10)
    if (ymd > endYMD) break
    if (isDateBlocked(ymd, blocks)) continue
    const slots = generateDaySlots(ranges, ymd, appointments, now)
    if (slots.length > 0) days[ymd] = slots
  }
  return days
}

/**
 * Busca al paciente por nombre COMPLETO normalizado (sin acentos/mayúsculas/espacios extra).
 * Compara la concatenación nombre+apellido, así el corte entre first/last no importa.
 * Devuelve el paciente solo con EXACTAMENTE 1 coincidencia; con 0 o varias devuelve null
 * (el flujo sigue como registro y el staff lo resuelve al aprobar). Nunca hacer fuzzy aquí:
 * un falso positivo vincularía la cita al expediente de otra persona.
 */
export function matchPatientByFullName<T extends { first_name: string | null; last_name: string | null }>(
  patients: T[],
  firstName: string,
  lastName: string,
): T | null {
  const target = normalizeName(`${firstName} ${lastName}`)
  if (!target) return null
  const matches = patients.filter(p => normalizeName(`${p.first_name ?? ''} ${p.last_name ?? ''}`) === target)
  return matches.length === 1 ? matches[0] : null
}

/**
 * Divide el nombre completo de la caja única del portal en nombres/apellidos para la ficha:
 * las DOS últimas palabras son los apellidos (convención hondureña de dos apellidos) y el
 * resto son nombres. Con 2-3 palabras: la(s) primera(s) es nombre y las demás apellidos.
 * Devuelve `words` para que el llamador valide el mínimo (el portal exige 4).
 */
export function splitFullName(fullName: string): { firstName: string; lastName: string; words: number } {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '', words: 0 }
  if (parts.length === 1) return { firstName: parts[0], lastName: '', words: 1 }
  const lastCount = parts.length >= 3 ? 2 : 1
  return {
    firstName: parts.slice(0, parts.length - lastCount).join(' '),
    lastName: parts.slice(parts.length - lastCount).join(' '),
    words: parts.length,
  }
}

/** Identidad normalizada para COMPARAR: solo letras/números en minúsculas (sin guiones/espacios). */
export function normalizeIdCard(raw: string | null | undefined): string {
  return (raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Matching del portal público: la IDENTIDAD manda (si coincide con exactamente un paciente,
 * es esa persona aunque haya escrito el nombre distinto); si no hay identidad, no existe o es
 * ambigua, decide el nombre completo normalizado (exactamente 1 coincidencia).
 */
export function matchPatientRecord<T extends { first_name: string | null; last_name: string | null; id_card: string | null }>(
  patients: T[],
  fullName: string,
  idCard: string | null | undefined,
): T | null {
  const normalizedId = normalizeIdCard(idCard)
  if (normalizedId) {
    const byId = patients.filter(p => normalizeIdCard(p.id_card) === normalizedId)
    if (byId.length === 1) return byId[0]
  }
  return matchPatientByFullName(patients, fullName, '')
}

/**
 * Resuelve qué horario aplica para un link de agendamiento según su sede:
 *  - Si el médico tiene rangos PROPIOS de esa sede, se usan solo esos.
 *  - Si no (o el link no tiene sede), se usa su horario GENERAL (filas con location_id null).
 * Así un médico con dos clínicas maneja horarios distintos por sede, y el que no distingue
 * sedes define un solo horario general para toda la organización.
 */
export function schedulesForLocation<T extends { location_id: string | null }>(
  rows: T[],
  locationId: string | null,
): T[] {
  if (locationId) {
    const ownRows = rows.filter(r => r.location_id === locationId)
    if (ownRows.length > 0) return ownRows
  }
  return rows.filter(r => r.location_id === null)
}

/** Rango editable del formulario de horarios (antes de guardar en doctor_schedules). */
export interface EditableScheduleRange {
  weekday: number
  start: string // 'HH:MM'
  end: string
}

const STRICT_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Valida los rangos de horario de un médico: formato HH:MM de 24 horas, fin > inicio, weekday
 * 0..6 y sin solapes entre rangos del mismo día (que se toquen, fin == inicio, es válido).
 * Compartida por el formulario de Configuración y su server action.
 */
export function validateScheduleRanges(ranges: EditableScheduleRange[]): string | null {
  for (const r of ranges) {
    if (!Number.isInteger(r.weekday) || r.weekday < 0 || r.weekday > 6) {
      return 'Día de la semana inválido.'
    }
    if (!STRICT_HHMM.test(r.start) || !STRICT_HHMM.test(r.end)) {
      return 'Las horas deben tener formato HH:MM (24 horas).'
    }
    if (r.end <= r.start) {
      return 'La hora de fin debe ser mayor que la de inicio.'
    }
  }

  const byDay = new Map<number, EditableScheduleRange[]>()
  for (const r of ranges) {
    const list = byDay.get(r.weekday) ?? []
    list.push(r)
    byDay.set(r.weekday, list)
  }
  for (const list of byDay.values()) {
    const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start))
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < sorted[i - 1].end) {
        return 'Hay rangos de horario que se solapan en el mismo día.'
      }
    }
  }
  return null
}
