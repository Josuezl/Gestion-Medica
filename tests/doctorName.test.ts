import { describe, it, expect } from 'vitest'
import { firstWord, personShortName, doctorTitle, doctorShortName } from '@/utils/doctorName'

describe('firstWord', () => {
  it('toma la primera palabra y tolera null/vacío', () => {
    expect(firstWord('Manuel Armando')).toBe('Manuel')
    expect(firstWord('')).toBe('')
    expect(firstWord(null)).toBe('')
  })
})

describe('personShortName', () => {
  it('usa primer nombre + primer apellido', () => {
    expect(personShortName('Manuel Armando', 'Espinoza Rueda')).toBe('Manuel Espinoza')
  })
})

describe('doctorTitle', () => {
  it('Dra. solo si el género es F; Dr. en cualquier otro caso', () => {
    expect(doctorTitle('F')).toBe('Dra.')
    expect(doctorTitle('M')).toBe('Dr.')
    expect(doctorTitle('O')).toBe('Dr.')
    expect(doctorTitle(null)).toBe('Dr.')
  })
})

describe('doctorShortName', () => {
  it('arma "Dr./Dra. nombre apellido" según el género', () => {
    expect(doctorShortName('Ana', 'Lopez', 'F')).toBe('Dra. Ana Lopez')
    expect(doctorShortName('Juan', 'Perez', 'M')).toBe('Dr. Juan Perez')
  })

  it('devuelve "Médico" si no hay nombre', () => {
    expect(doctorShortName(null, null, null)).toBe('Médico')
  })
})
