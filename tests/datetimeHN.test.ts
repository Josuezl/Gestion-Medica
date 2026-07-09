import { describe, it, expect } from 'vitest'
import { ymdHN, hm24HN, minutesOfDayHN, formatDateLongHN, formatDateTimeLongHN } from '../utils/datetime'

/**
 * Estos helpers deben dar el mismo resultado sin importar la zona horaria del proceso
 * (servidor UTC vs navegador Honduras): esa es justamente la causa del "parpadeo" de citas
 * nocturnas. Como no podemos cambiar process.env.TZ dentro del test de forma portable,
 * validamos el contrato en instantes conocidos (el runtime de CI corre en UTC).
 */
describe('helpers de fecha/hora fijados a Honduras (UTC-6)', () => {
  // 6:00 p.m. del 4-jul en Honduras == 2026-07-05T00:00:00Z (medianoche UTC del día siguiente)
  const citaNocturna = '2026-07-05T00:00:00Z'

  it('ymdHN agrupa la cita nocturna en su día real de Honduras, no el siguiente', () => {
    expect(ymdHN(citaNocturna)).toBe('2026-07-04')
  })

  it('hm24HN muestra la hora de Honduras (18:00), no la UTC (00:00)', () => {
    expect(hm24HN(citaNocturna)).toBe('18:00')
  })

  it('medianoche de Honduras se formatea como 00:00 (no 24:00)', () => {
    // 6-jul 06:00Z == medianoche del 6-jul en Honduras
    expect(hm24HN('2026-07-06T06:00:00Z')).toBe('00:00')
    expect(ymdHN('2026-07-06T06:00:00Z')).toBe('2026-07-06')
  })

  it('minutesOfDayHN devuelve los minutos desde medianoche en hora de Honduras', () => {
    expect(minutesOfDayHN(citaNocturna)).toBe(18 * 60) // 1080
    expect(minutesOfDayHN('2026-07-05T13:30:00Z')).toBe(7 * 60 + 30) // 07:30 HN
  })

  it('acepta string, number y Date', () => {
    const d = new Date(citaNocturna)
    expect(ymdHN(d)).toBe('2026-07-04')
    expect(ymdHN(d.getTime())).toBe('2026-07-04')
  })
})

describe('fechas de cita escritas en palabras (zona HN)', () => {
  // 14:00Z del 9-jul == 8:00 a. m. en Honduras (UTC-6).
  const cita8am = '2026-07-09T14:00:00Z'

  it('formatDateLongHN da "jueves 9 de julio de 2026" (sin coma tras el día de la semana)', () => {
    expect(formatDateLongHN(cita8am)).toBe('jueves 9 de julio de 2026')
  })

  it('usa el día CALENDARIO de Honduras, no el UTC, para citas nocturnas', () => {
    // 00:00Z del 5-jul == 6:00 p. m. del 4-jul en Honduras (sábado).
    expect(formatDateLongHN('2026-07-05T00:00:00Z')).toBe('sábado 4 de julio de 2026')
  })

  it('formatDateTimeLongHN antepone la fecha larga y agrega la hora 12h sin cero inicial', () => {
    const out = formatDateTimeLongHN(cita8am)
    expect(out.startsWith('jueves 9 de julio de 2026, ')).toBe(true)
    expect(out).toMatch(/8:00/)
    expect(out).toMatch(/m\./) // meridiano a. m./p. m. (el texto exacto lo fija ICU)
  })

  it('acepta string, number y Date', () => {
    const d = new Date(cita8am)
    expect(formatDateLongHN(d)).toBe('jueves 9 de julio de 2026')
    expect(formatDateLongHN(d.getTime())).toBe('jueves 9 de julio de 2026')
  })
})
