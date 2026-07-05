import { describe, it, expect } from 'vitest'
import { greetingForHonduras, isDoctorRole, greetingName, hondurasDayRangeUTC } from '@/utils/greeting'

// Honduras es UTC-6 fijo (sin horario de verano). Construimos instantes en UTC y razonamos
// sobre la hora local de Honduras resultante (UTC - 6h).
const utc = (y: number, mo: number, d: number, h: number, min = 0) =>
  new Date(Date.UTC(y, mo - 1, d, h, min))

describe('greetingForHonduras', () => {
  it('Buenas noches antes de las 5:00 HN', () => {
    // HN 04:59 = UTC 10:59
    expect(greetingForHonduras(utc(2026, 7, 4, 10, 59))).toBe('Buenas noches')
  })
  it('Buenos días de 5:00 a 11:59 HN', () => {
    expect(greetingForHonduras(utc(2026, 7, 4, 11, 0))).toBe('Buenos días') // HN 05:00
    expect(greetingForHonduras(utc(2026, 7, 4, 17, 59))).toBe('Buenos días') // HN 11:59
  })
  it('Buenas tardes de 12:00 a 18:59 HN', () => {
    expect(greetingForHonduras(utc(2026, 7, 4, 18, 0))).toBe('Buenas tardes') // HN 12:00
    expect(greetingForHonduras(utc(2026, 7, 5, 0, 59))).toBe('Buenas tardes') // HN 18:59
  })
  it('Buenas noches de 19:00 en adelante HN', () => {
    expect(greetingForHonduras(utc(2026, 7, 5, 1, 0))).toBe('Buenas noches') // HN 19:00
    expect(greetingForHonduras(utc(2026, 7, 5, 5, 0))).toBe('Buenas noches') // HN 23:00
  })
})

describe('isDoctorRole', () => {
  it('DOCTOR y ADMIN son doctores; ASSISTANT/NURSE y nulos no', () => {
    expect(isDoctorRole('DOCTOR')).toBe(true)
    expect(isDoctorRole('ADMIN')).toBe(true)
    expect(isDoctorRole('ASSISTANT')).toBe(false)
    expect(isDoctorRole('NURSE')).toBe(false)
    expect(isDoctorRole(null)).toBe(false)
    expect(isDoctorRole(undefined)).toBe(false)
  })
})

describe('greetingName', () => {
  it('doctores llevan título según género', () => {
    expect(greetingName('DOCTOR', 'Juan', 'Perez', 'M')).toBe('Dr. Juan Perez')
    expect(greetingName('ADMIN', 'Ana', 'Lopez', 'F')).toBe('Dra. Ana Lopez')
  })
  it('personal (asistente/enfermería) solo el nombre, sin título', () => {
    expect(greetingName('ASSISTANT', 'Maria Jose', 'Diaz Cruz', 'F')).toBe('Maria Diaz')
    expect(greetingName('NURSE', 'Rosa', 'Mena', null)).toBe('Rosa Mena')
  })
})

describe('hondurasDayRangeUTC', () => {
  it('devuelve [medianoche HN, medianoche HN siguiente) en ISO UTC (06:00Z)', () => {
    // HN 12:00 del 4-jul = UTC 18:00 del 4-jul
    const r = hondurasDayRangeUTC(utc(2026, 7, 4, 18, 0))
    expect(r.startISO).toBe('2026-07-04T06:00:00.000Z')
    expect(r.endISO).toBe('2026-07-05T06:00:00.000Z')
  })
  it('antes de las 6:00 UTC el día HN sigue siendo el anterior', () => {
    // UTC 05:00 del 4-jul = HN 23:00 del 3-jul
    const r = hondurasDayRangeUTC(utc(2026, 7, 4, 5, 0))
    expect(r.startISO).toBe('2026-07-03T06:00:00.000Z')
    expect(r.endISO).toBe('2026-07-04T06:00:00.000Z')
  })
})
