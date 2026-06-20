import { describe, it, expect } from 'vitest'
import { validateVitals, isValidAppointmentStatus, VALID_APPOINTMENT_STATUSES, sanitizeName, normalizeName } from '@/utils/validation'

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

describe('sanitizeName', () => {
  it('conserva nombres con acentos, apóstrofo y guion', () => {
    expect(sanitizeName('José María O\'Brien-López')).toBe('José María O\'Brien-López')
  })

  it('quita dígitos, emojis y caracteres extraños (conserva letras)', () => {
    expect(sanitizeName('Ju4n 99 #! 🤖 Pérez')).toBe('Ju n Pérez')
  })

  it('colapsa espacios y recorta', () => {
    expect(sanitizeName('   Ana    Sofía   ')).toBe('Ana Sofía')
  })

  it('usa el fallback cuando no queda nada útil', () => {
    expect(sanitizeName('1234 😀', 'Paciente Nuevo')).toBe('Paciente Nuevo')
    expect(sanitizeName(null)).toBe('Paciente')
  })

  it('limita la longitud a 60', () => {
    expect(sanitizeName('a'.repeat(200)).length).toBe(60)
  })
})

describe('normalizeName (para detectar duplicados)', () => {
  it('quita acentos, mayúsculas y espacios extra', () => {
    expect(normalizeName('  José  PÉREZ ')).toBe('jose perez')
    expect(normalizeName('María José Hernández')).toBe('maria jose hernandez')
  })

  it('dos escrituras del mismo nombre coinciden', () => {
    expect(normalizeName('Juan Peréz')).toBe(normalizeName('JUAN PEREZ'))
    expect(normalizeName('Ana  Gómez')).toBe(normalizeName('ana gomez'))
  })

  it('nombres distintos no coinciden', () => {
    expect(normalizeName('Juan Perez') === normalizeName('Juan Peralta')).toBe(false)
  })

  it('tolera null/undefined', () => {
    expect(normalizeName(null)).toBe('')
    expect(normalizeName(undefined)).toBe('')
  })
})
