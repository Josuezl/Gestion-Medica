import { describe, it, expect } from 'vitest'
// Lógica pura del backup casero (scripts/backup-lib.mjs); se testea aquí con vitest.
import { pickOrderColumn, verifyBackupCounts, CORE_TABLES } from '../scripts/backup-lib.mjs'

describe('pickOrderColumn', () => {
  it('prefiere id cuando existe', () => {
    expect(pickOrderColumn({ id: {}, name: {} })).toBe('id')
  })
  it('cae a created_at si no hay id', () => {
    expect(pickOrderColumn({ created_at: {}, name: {} })).toBe('created_at')
  })
  it('devuelve null sin columnas conocidas', () => {
    expect(pickOrderColumn({ nombre: {} })).toBeNull()
    expect(pickOrderColumn(undefined)).toBeNull()
  })
})

describe('verifyBackupCounts', () => {
  const manifest = {
    generatedAt: '2026-07-11T07:15:00Z',
    tables: { clinics: 2, patients: 100, consultations: 50, prescriptions: 30, appointments: 40, user_profiles: 8, booking_rate_events: 0 },
  }

  it('sin problemas cuando todo coincide', () => {
    const actual = { ...manifest.tables }
    expect(verifyBackupCounts(manifest, actual)).toEqual([])
  })

  it('detecta conteo que no coincide', () => {
    const problems = verifyBackupCounts(manifest, { ...manifest.tables, patients: 99 })
    expect(problems.some((p) => p.includes('patients') && p.includes('99'))).toBe(true)
  })

  it('detecta archivo de tabla faltante', () => {
    const actual: Record<string, number> = { ...manifest.tables }
    delete actual.consultations
    const problems = verifyBackupCounts(manifest, actual)
    expect(problems.some((p) => p.includes('consultations') && p.toLowerCase().includes('falta'))).toBe(true)
  })

  it('exige que las tablas núcleo no estén vacías', () => {
    const manifestVacio = { generatedAt: 'x', tables: { ...manifest.tables, patients: 0 } }
    const problems = verifyBackupCounts(manifestVacio, { ...manifestVacio.tables })
    expect(problems.some((p) => p.includes('patients') && p.includes('vacía'))).toBe(true)
  })

  it('una tabla no-núcleo vacía NO es problema', () => {
    expect(verifyBackupCounts(manifest, { ...manifest.tables })).toEqual([])
  })

  it('las tablas núcleo esperadas están declaradas', () => {
    expect(CORE_TABLES).toEqual(
      expect.arrayContaining(['clinics', 'user_profiles', 'patients', 'consultations', 'prescriptions', 'appointments'])
    )
  })

  it('detecta tabla núcleo ausente del manifest', () => {
    const sinPacientes = { generatedAt: 'x', tables: { ...manifest.tables } as Record<string, number> }
    delete sinPacientes.tables.patients
    const problems = verifyBackupCounts(sinPacientes, { ...sinPacientes.tables })
    expect(problems.some((p) => p.includes('patients'))).toBe(true)
  })
})
