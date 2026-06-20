import { describe, it, expect } from 'vitest'
import { validateVitals, isValidAppointmentStatus, VALID_APPOINTMENT_STATUSES } from '@/utils/validation'

describe('validateVitals', () => {
  it('devuelve null cuando no se ingresó ningún vital', () => {
    expect(validateVitals({})).toBeNull()
  })

  it('devuelve null con valores normales', () => {
    expect(validateVitals({ temperature: 36.5, weight: 70, height: 165, heartRate: 72, oxygenSaturation: 98 })).toBeNull()
  })

  it('ignora los valores null/undefined', () => {
    expect(validateVitals({ weight: null, temperature: undefined })).toBeNull()
  })

  it('rechaza peso fuera de rango (p. ej. gramos) y nombra el campo', () => {
    const err = validateVitals({ weight: 75000 })
    expect(err).toContain('Peso')
  })

  it('rechaza temperatura imposible', () => {
    expect(validateVitals({ temperature: 50 })).toContain('Temperatura')
  })

  it('rechaza SpO2 > 100', () => {
    expect(validateVitals({ oxygenSaturation: 120 })).toContain('SpO2')
  })

  it('respeta los límites inclusivos (600 kg ok, 600.5 no)', () => {
    expect(validateVitals({ weight: 600 })).toBeNull()
    expect(validateVitals({ weight: 600.5 })).not.toBeNull()
  })

  it('rechaza NaN', () => {
    expect(validateVitals({ heartRate: NaN })).toContain('Ritmo cardiaco')
  })
})

describe('isValidAppointmentStatus', () => {
  it('acepta los estados válidos', () => {
    for (const s of VALID_APPOINTMENT_STATUSES) expect(isValidAppointmentStatus(s)).toBe(true)
  })

  it('rechaza estados inválidos, vacíos y de distinta capitalización', () => {
    expect(isValidAppointmentStatus('HACKEADO')).toBe(false)
    expect(isValidAppointmentStatus('')).toBe(false)
    expect(isValidAppointmentStatus('completed')).toBe(false)
  })
})
