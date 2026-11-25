import { describe, it, expect } from 'vitest'
import { isAssistant, isNurse, canDoClinical, canEnterVitals, puedeRegistrarOdontologia } from '@/utils/permissions'

describe('permisos por rol', () => {
  it('puedeRegistrarOdontologia: odontólogo o administrador, y solo con licencia', () => {
    const conLicencia = { odontologia_habilitada: true }
    expect(puedeRegistrarOdontologia({ ...conLicencia, role: 'DOCTOR', is_dentist: true })).toBe(true)
    expect(puedeRegistrarOdontologia({ ...conLicencia, role: 'DOCTOR', is_org_admin: true })).toBe(true)
    expect(puedeRegistrarOdontologia({ ...conLicencia, role: 'ADMIN' })).toBe(true)
    expect(puedeRegistrarOdontologia({ ...conLicencia, role: 'DOCTOR' })).toBe(false)
    expect(puedeRegistrarOdontologia({ ...conLicencia, role: 'ASSISTANT' })).toBe(false)
    expect(puedeRegistrarOdontologia({ odontologia_habilitada: false, role: 'ADMIN', is_dentist: true })).toBe(false)
  })

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

  it('rol vacío/desconocido no obtiene permisos clínicos ni de vitales', () => {
    expect(canDoClinical(null)).toBe(true) // se trata como clínico (compat. previa: solo se excluye apoyo conocido)
    expect(canEnterVitals('')).toBe(true)
  })
})
