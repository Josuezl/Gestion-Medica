import { describe, it, expect } from 'vitest'
import { decidirGeneracion, nombreGeneracion, GENERACION_INICIAL } from '../scripts/respaldo-r2-generacion.mjs'

const ahora = new Date('2026-11-02T07:15:42Z')

describe('decidirGeneracion', () => {
  it('primera corrida (sin puntero): adopta la generación inicial y crea testigo', () => {
    expect(decidirGeneracion({ puntero: null, testigo: null, ahora })).toEqual({
      generacion: GENERACION_INICIAL, nueva: true, motivo: 'inicio',
    })
  })

  it('el testigo abre: sigue con la misma generación', () => {
    expect(decidirGeneracion({ puntero: 'k2', testigo: 'abre', ahora })).toEqual({
      generacion: 'k2', nueva: false, motivo: 'igual',
    })
  })

  it('el testigo no abre: rotación detectada, generación nueva con fecha', () => {
    expect(decidirGeneracion({ puntero: 'k2', testigo: 'no-abre', ahora })).toEqual({
      generacion: 'k202611020715', nueva: true, motivo: 'rotacion',
    })
  })

  it('puntero sin testigo: falla en vez de adivinar', () => {
    expect(() => decidirGeneracion({ puntero: 'k2', testigo: 'falta', ahora })).toThrow(/inconsistente/)
  })
})

describe('nombreGeneracion', () => {
  it('usa la fecha UTC hasta el minuto', () => {
    expect(nombreGeneracion(new Date('2027-01-09T23:05:59Z'))).toBe('k202701092305')
  })
})
