import { describe, it, expect } from 'vitest'
import {
  VITALS_FIELDS,
  vitalsFromPreclinical,
  isVitalsBlank,
  decidePreclinicalUpdate,
  type VitalsValues,
} from '@/utils/preclinicalMerge'
import type { PreclinicalVitalsRow } from '@/utils/clinicalTypes'

// Campos de signos vacíos, como los lee el formulario recién abierto.
function blank(): VitalsValues {
  return Object.fromEntries(VITALS_FIELDS.map((f) => [f, ''])) as VitalsValues
}

function row(overrides: Partial<PreclinicalVitalsRow> = {}): PreclinicalVitalsRow {
  return {
    id: 'pv-1',
    created_at: '2026-07-24T15:00:00.000Z',
    blood_pressure: '120/80',
    temperature: 36.8,
    weight: 70.5,
    height: 175,
    heart_rate: 72,
    respiratory_rate: 16,
    oxygen_saturation: 98,
    ...overrides,
  }
}

describe('vitalsFromPreclinical', () => {
  it('convierte la fila a los valores de texto que esperan los inputs', () => {
    const v = vitalsFromPreclinical(row())
    expect(v.blood_pressure).toBe('120/80')
    expect(v.temperature).toBe('36.8')
    expect(v.weight).toBe('70.5')
    expect(v.oxygen_saturation).toBe('98')
  })

  it('los nulos quedan como cadena vacía, no como "null"', () => {
    const v = vitalsFromPreclinical(row({ temperature: null, blood_pressure: null }))
    expect(v.temperature).toBe('')
    expect(v.blood_pressure).toBe('')
  })

  it('un 0 es un valor real y se conserva', () => {
    // Peso 0 no existe clínicamente, pero SpO2/temperatura mal tomadas sí llegan en 0 y el
    // médico debe verlas para corregirlas, no perderlas por un chequeo de "falsy".
    const v = vitalsFromPreclinical(row({ oxygen_saturation: 0, temperature: 0 }))
    expect(v.oxygen_saturation).toBe('0')
    expect(v.temperature).toBe('0')
  })
})

describe('isVitalsBlank', () => {
  it('vacío es vacío', () => {
    expect(isVitalsBlank(blank())).toBe(true)
  })

  it('solo espacios cuenta como vacío', () => {
    expect(isVitalsBlank({ ...blank(), blood_pressure: '   ' })).toBe(true)
  })

  it('un 0 escrito NO es vacío', () => {
    expect(isVitalsBlank({ ...blank(), heart_rate: '0' })).toBe(false)
  })

  it('un solo campo lleno basta para no estar vacío', () => {
    expect(isVitalsBlank({ ...blank(), temperature: '37' })).toBe(false)
  })
})

describe('decidePreclinicalUpdate', () => {
  it('campos vacíos → autollena', () => {
    const d = decidePreclinicalUpdate({ current: blank(), incoming: row(), lastApplied: null })
    expect(d.action).toBe('autofill')
    expect(d.values.blood_pressure).toBe('120/80')
  })

  it('el médico ya escribió → ofrece, no pisa', () => {
    const current = { ...blank(), blood_pressure: '130/85' }
    const d = decidePreclinicalUpdate({ current, incoming: row(), lastApplied: null })
    expect(d.action).toBe('offer')
  })

  it('el médico escribió UN campo → protege TODA la sección', () => {
    // No se llenan "los demás" campos: mezclar lo que él midió con lo que midió otra persona
    // produciría un cuadro clínico que nadie tomó completo.
    const current = { ...blank(), temperature: '38.5' }
    const d = decidePreclinicalUpdate({ current, incoming: row(), lastApplied: null })
    expect(d.action).toBe('offer')
  })

  it('lo que autollenamos y nadie tocó → se reemplaza (corrección de la asistente)', () => {
    const applied = vitalsFromPreclinical(row())
    const corrected = row({ temperature: 37.2 })
    const d = decidePreclinicalUpdate({ current: applied, incoming: corrected, lastApplied: applied })
    expect(d.action).toBe('autofill')
    expect(d.values.temperature).toBe('37.2')
  })

  it('autollenamos y el médico corrigió encima → ya es suyo, se ofrece', () => {
    const applied = vitalsFromPreclinical(row())
    const touched = { ...applied, temperature: '39.0' }
    const d = decidePreclinicalUpdate({ current: touched, incoming: row({ temperature: 37.2 }), lastApplied: applied })
    expect(d.action).toBe('offer')
  })

  it('los valores ofrecidos son los mismos que se autollenarían', () => {
    const current = { ...blank(), weight: '80' }
    const d = decidePreclinicalUpdate({ current, incoming: row(), lastApplied: null })
    expect(d.values).toEqual(vitalsFromPreclinical(row()))
  })

  it('fila entrante sin ningún signo → no hay nada que ofrecer', () => {
    const empty = row({
      blood_pressure: null, temperature: null, weight: null, height: null,
      heart_rate: null, respiratory_rate: null, oxygen_saturation: null,
    })
    const d = decidePreclinicalUpdate({ current: blank(), incoming: empty, lastApplied: null })
    expect(d.action).toBe('none')
  })

  it('el perímetro cefálico viaja aunque el paciente no sea pediátrico (el form decide si existe)', () => {
    const d = decidePreclinicalUpdate({ current: blank(), incoming: row({ head_circumference: 48.5 }), lastApplied: null })
    expect(d.values.head_circumference).toBe('48.5')
  })
})
