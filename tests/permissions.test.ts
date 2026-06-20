import { describe, it, expect } from 'vitest'
import { isAssistant, isNurse, canDoClinical, canEnterVitals, canEditPrescription } from '@/utils/permissions'

describe('permisos por rol', () => {
  it('isAssistant / isNurse identifican su rol (case-insensitive)', () => {
    expect(isAssistant('ASSISTANT')).toBe(true)
    expect(isAssistant('assistant')).toBe(true)
    expect(isAssistant('NURSE')).toBe(false)
    expect(isNurse('NURSE')).toBe(true)
    expect(isNurse(' nurse ')).toBe(true)
    expect(isNurse('DOCTOR')).toBe(false)
  })

  it('canDoClinical: solo médico/admin (excluye asistente y enfermera)', () => {
    expect(canDoClinical('ADMIN')).toBe(true)
    expect(canDoClinical('DOCTOR')).toBe(true)
    expect(canDoClinical('ASSISTANT')).toBe(false)
    expect(canDoClinical('NURSE')).toBe(false)
  })

  it('canEnterVitals: médico/admin + enfermera; NO la asistente', () => {
    expect(canEnterVitals('ADMIN')).toBe(true)
    expect(canEnterVitals('DOCTOR')).toBe(true)
    expect(canEnterVitals('NURSE')).toBe(true)
    expect(canEnterVitals('ASSISTANT')).toBe(false)
  })

  it('canEditPrescription: solo clínico (asistente y enfermera no editan recetas)', () => {
    expect(canEditPrescription('DOCTOR')).toBe(true)
    expect(canEditPrescription('ASSISTANT')).toBe(false)
    expect(canEditPrescription('NURSE')).toBe(false)
  })

  it('rol vacío/desconocido no obtiene permisos clínicos ni de vitales', () => {
    expect(canDoClinical(null)).toBe(true) // se trata como clínico (compat. previa: solo se excluye apoyo conocido)
    expect(canEnterVitals('')).toBe(true)
  })
})
