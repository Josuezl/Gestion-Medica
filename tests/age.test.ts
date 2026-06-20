import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { calculateAge, isPediatric } from '@/utils/age'

// Fijamos "hoy" para que las edades sean deterministas. Se usan fechas de nacimiento en enero
// (lejos de junio) para que el resultado no dependa del huso horario al parsear la fecha.
describe('calculateAge / isPediatric', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-19T12:00:00'))
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  it('calcula años cumplidos', () => {
    expect(calculateAge('2000-01-15')).toBe(26)
  })

  it('devuelve 0 con fecha nula o inválida', () => {
    expect(calculateAge(null)).toBe(0)
    expect(calculateAge('no-es-fecha')).toBe(0)
  })

  it('pediátrico = menor de 19 (regla del sistema)', () => {
    expect(isPediatric('2012-01-15')).toBe(true) // 14 años
    expect(isPediatric('2008-01-15')).toBe(true) // 18 años (límite)
    expect(isPediatric('2007-01-15')).toBe(false) // 19 años
    expect(isPediatric('2002-01-15')).toBe(false) // 24 años
  })
})
