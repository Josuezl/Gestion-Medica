import type { Appointment } from '@/app/dashboard/AgendaClient'

/** Fila tal como viaja en el evento de Realtime: sin joins (no trae `patients`). */
export interface AppointmentEventRow {
  id: string
  scheduled_at: string
  status: string
  notes: string | null
  duration_minutes: number
  doctor_id: string
  location_id: string | null
  clinic_id?: string
  patient_id?: string
}

export type SyncAction =
  | { type: 'ignore' }
  | { type: 'remove'; id: string }
  | { type: 'patch'; id: string; row: AppointmentEventRow }
  | { type: 'fetch'; id: string }

const HN_TZ = 'America/Tegucigalpa'

/** 'YYYY-MM' del instante en hora de Honduras (misma convención que la agenda). */
export function monthKey(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: HN_TZ, year: 'numeric', month: '2-digit' })
    .formatToParts(new Date(iso))
  const y = parts.find(p => p.type === 'year')?.value ?? '0000'
  const m = parts.find(p => p.type === 'month')?.value ?? '00'
  return `${y}-${m}`
}

/** ¿La cita cae en la ventana precargada o en un mes ya traído bajo demanda? */
export function isWithinLoadedWindow(
  scheduledAt: string,
  loadedRangeStart: string,
  loadedRangeEnd: string,
  loadedMonthKeys: string[],
): boolean {
  const t = new Date(scheduledAt).getTime()
  if (t >= new Date(loadedRangeStart).getTime() && t < new Date(loadedRangeEnd).getTime()) return true
  return loadedMonthKeys.includes(monthKey(scheduledAt))
}

/** Decide qué hacer con un evento, sin tocar red ni estado. */
export function classifyEvent(
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  row: AppointmentEventRow,
  ctx: { knownIds: Set<string>; isRelevant: (scheduledAt: string) => boolean },
): SyncAction {
  if (eventType === 'DELETE') return { type: 'remove', id: row.id }

  const relevant = ctx.isRelevant(row.scheduled_at)
  const known = ctx.knownIds.has(row.id)

  if (relevant) return known ? { type: 'patch', id: row.id, row } : { type: 'fetch', id: row.id }
  // No relevante: si estaba en pantalla (reprogramada fuera de la ventana), se quita; si no, nada.
  return known ? { type: 'remove', id: row.id } : { type: 'ignore' }
}

/** Aplica los campos del evento sobre una cita ya cargada, conservando sus joins. */
export function patchAppointment(existing: Appointment, row: AppointmentEventRow): Appointment {
  return {
    ...existing,
    scheduled_at: row.scheduled_at,
    status: row.status,
    notes: row.notes,
    duration_minutes: row.duration_minutes,
    doctor_id: row.doctor_id,
    location_id: row.location_id,
  }
}

/** Overlay en vivo sobre las citas base: live sobrescribe/agrega por id; removedIds se excluyen. */
export function mergeLiveAppointments(
  base: Appointment[],
  live: Map<string, Appointment>,
  removedIds: Set<string>,
): Appointment[] {
  const byId = new Map<string, Appointment>()
  for (const a of base) byId.set(a.id, a)
  for (const [id, a] of live) byId.set(id, a)
  const out: Appointment[] = []
  for (const a of byId.values()) if (!removedIds.has(a.id)) out.push(a)
  return out
}
