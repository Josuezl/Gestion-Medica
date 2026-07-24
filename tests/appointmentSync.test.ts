import { describe, it, expect } from 'vitest'
import {
  monthKey,
  isWithinLoadedWindow,
  classifyEvent,
  patchAppointment,
  mergeLiveAppointments,
  type AppointmentEventRow,
} from '@/utils/appointmentSync'
import type { Appointment } from '@/app/dashboard/AgendaClient'

const row = (over: Partial<AppointmentEventRow> = {}): AppointmentEventRow => ({
  id: 'a1', scheduled_at: '2026-07-24T16:00:00Z', status: 'CONFIRMED', notes: null,
  duration_minutes: 30, doctor_id: 'd1', location_id: 'l1', clinic_id: 'c1', patient_id: 'p1', ...over,
})
const appt = (over: Partial<Appointment> = {}): Appointment => ({
  id: 'a1', scheduled_at: '2026-07-24T16:00:00Z', status: 'CONFIRMED', notes: null,
  duration_minutes: 30, doctor_id: 'd1', location_id: 'l1',
  patients: { id: 'p1', first_name: 'Ana', last_name: 'Ruiz', phone: '' } as Appointment['patients'], ...over,
})
const WIN_START = '2026-07-01T06:00:00Z'
const WIN_END = '2026-09-01T06:00:00Z'

describe('monthKey', () => {
  it('da YYYY-MM en hora de Honduras', () => {
    // 2026-08-01T04:00Z = 2026-07-31 22:00 en HN → mes 07
    expect(monthKey('2026-08-01T04:00:00Z')).toBe('2026-07')
    expect(monthKey('2026-08-01T16:00:00Z')).toBe('2026-08')
  })
})

describe('isWithinLoadedWindow', () => {
  it('true dentro de la ventana', () => {
    expect(isWithinLoadedWindow('2026-07-24T16:00:00Z', WIN_START, WIN_END, [])).toBe(true)
  })
  it('false fuera de la ventana y sin mes cargado', () => {
    expect(isWithinLoadedWindow('2026-12-10T16:00:00Z', WIN_START, WIN_END, [])).toBe(false)
  })
  it('true si el mes está cargado bajo demanda aunque salga de la ventana', () => {
    expect(isWithinLoadedWindow('2026-12-10T16:00:00Z', WIN_START, WIN_END, ['2026-12'])).toBe(true)
  })
})

describe('classifyEvent', () => {
  const relevant = { knownIds: new Set<string>(), isRelevant: () => true }
  const irrelevant = { knownIds: new Set<string>(), isRelevant: () => false }

  it('DELETE siempre pide quitar por id', () => {
    expect(classifyEvent('DELETE', row(), irrelevant)).toEqual({ type: 'remove', id: 'a1' })
  })
  it('INSERT relevante y desconocida → fetch', () => {
    expect(classifyEvent('INSERT', row(), relevant)).toEqual({ type: 'fetch', id: 'a1' })
  })
  it('INSERT no relevante → ignore', () => {
    expect(classifyEvent('INSERT', row(), irrelevant)).toEqual({ type: 'ignore' })
  })
  it('UPDATE relevante y conocida → patch', () => {
    const ctx = { knownIds: new Set(['a1']), isRelevant: () => true }
    expect(classifyEvent('UPDATE', row(), ctx)).toEqual({ type: 'patch', id: 'a1', row: row() })
  })
  it('UPDATE relevante y desconocida (entró a la ventana) → fetch', () => {
    const ctx = { knownIds: new Set<string>(), isRelevant: () => true }
    expect(classifyEvent('UPDATE', row(), ctx)).toEqual({ type: 'fetch', id: 'a1' })
  })
  it('UPDATE que salió de la ventana pero era conocida → remove', () => {
    const ctx = { knownIds: new Set(['a1']), isRelevant: () => false }
    expect(classifyEvent('UPDATE', row(), ctx)).toEqual({ type: 'remove', id: 'a1' })
  })
})

describe('patchAppointment', () => {
  it('parcha los campos del evento y conserva el join del paciente', () => {
    const out = patchAppointment(appt(), row({ status: 'WAITING', scheduled_at: '2026-07-24T18:00:00Z' }))
    expect(out.status).toBe('WAITING')
    expect(out.scheduled_at).toBe('2026-07-24T18:00:00Z')
    expect(out.patients?.first_name).toBe('Ana')
  })
})

describe('mergeLiveAppointments', () => {
  it('sobrescribe por id, agrega nuevas y excluye canceladas', () => {
    const base = [appt(), appt({ id: 'a2', status: 'PENDING' })]
    const live = new Map([['a2', appt({ id: 'a2', status: 'WAITING' })], ['a3', appt({ id: 'a3' })]])
    const out = mergeLiveAppointments(base, live, new Set(['a1']))
    const byId = Object.fromEntries(out.map(a => [a.id, a]))
    expect(byId.a1).toBeUndefined()          // cancelada
    expect(byId.a2.status).toBe('WAITING')   // sobrescrita por live
    expect(byId.a3).toBeDefined()            // nueva
  })
})
