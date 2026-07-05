import { describe, it, expect } from 'vitest'
import { patientIntro, summaryHeadline, aggregateDiagnoses, summarizeRecentConsultations, truncateLabel } from '@/utils/historySummary'
import type { ConsultationRow } from '@/utils/clinicalTypes'

const consult = (over: Partial<ConsultationRow>): ConsultationRow => ({
  id: Math.random().toString(36).slice(2),
  created_at: '2026-07-01T12:00:00.000Z',
  ...over,
})

describe('patientIntro', () => {
  it('usa masculino/femenino según el género y muestra la edad', () => {
    expect(patientIntro('M', 33)).toBe('Paciente masculino de 33 años')
    expect(patientIntro('F', 1)).toBe('Paciente femenino de 1 año')
  })
  it('sin género conocido, omite el sexo', () => {
    expect(patientIntro(null, 40)).toBe('Paciente de 40 años')
    expect(patientIntro('', 40)).toBe('Paciente de 40 años')
  })
  it('sin edad (0), omite la edad', () => {
    expect(patientIntro('F', 0)).toBe('Paciente femenino')
  })
})

describe('summaryHeadline', () => {
  it('antepone primer nombre + primer apellido y pasa "paciente" a minúscula', () => {
    expect(summaryHeadline('Juan Carlos', 'Perez Lopez', 'M', 33)).toBe('Juan Perez, paciente masculino de 33 años')
    expect(summaryHeadline('Ana', 'Diaz', 'F', 1)).toBe('Ana Diaz, paciente femenino de 1 año')
  })
  it('sin nombre, cae al intro sin nombre', () => {
    expect(summaryHeadline(null, null, 'M', 40)).toBe('Paciente masculino de 40 años')
  })
})

describe('aggregateDiagnoses', () => {
  it('agrupa por texto normalizado (mayúsculas/espacios) y cuenta', () => {
    const rows = [
      consult({ diagnosis: 'Gripe común' }),
      consult({ diagnosis: 'GRIPE  común' }), // mismo dx, distinta forma
      consult({ diagnosis: 'Hipertensión' }),
      consult({ diagnosis: '  ' }),           // vacío → se ignora
      consult({ diagnosis: null }),           // null → se ignora
    ]
    const out = aggregateDiagnoses(rows)
    expect(out).toEqual([
      { label: 'Gripe común', count: 2 },
      { label: 'Hipertensión', count: 1 },
    ])
  })
  it('ordena por frecuencia desc y luego alfabético', () => {
    const rows = [
      consult({ diagnosis: 'B' }),
      consult({ diagnosis: 'A' }),
      consult({ diagnosis: 'A' }),
      consult({ diagnosis: 'C' }),
    ]
    expect(aggregateDiagnoses(rows).map((d) => `${d.label}:${d.count}`)).toEqual(['A:2', 'B:1', 'C:1'])
  })
  it('lista vacía → []', () => {
    expect(aggregateDiagnoses([])).toEqual([])
  })
})

describe('truncateLabel', () => {
  it('deja intactos los diagnósticos cortos', () => {
    expect(truncateLabel('Hipertensión')).toBe('Hipertensión')
    expect(truncateLabel('Bronquitis')).toBe('Bronquitis')
  })
  it('acorta los largos a una línea con "…" (máx 24)', () => {
    const r = truncateLabel('BLOQUEO AURICULOVENTRICULAR DE TERCER GRADO')
    expect(r.endsWith('…')).toBe(true)
    expect(r.length).toBeLessThanOrEqual(24)
    expect(truncateLabel('Cardiopatia hipertensiva Hipertension')).toBe('Cardiopatia hipertensiv…')
  })
})

describe('summarizeRecentConsultations', () => {
  it('toma las primeras N (ya vienen ordenadas desc) y extrae los campos clave', () => {
    const rows = [
      consult({ created_at: '2026-07-05T10:00:00Z', diagnosis: 'Dx1', symptoms: 'Sx1', treatment_plan: 'Plan1', user_profiles: { first_name: 'Ana', last_name: 'Lopez', gender: 'F' } }),
      consult({ created_at: '2026-06-01T10:00:00Z', diagnosis: 'Dx2', symptoms: 'Sx2', treatment_plan: 'Plan2', user_profiles: { first_name: 'Juan', last_name: 'Perez', gender: 'M' } }),
      consult({ created_at: '2026-05-01T10:00:00Z', diagnosis: 'Dx3' }),
    ]
    const out = summarizeRecentConsultations(rows, 2)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ date: '2026-07-05T10:00:00Z', doctorName: 'Dra. Ana Lopez', symptoms: 'Sx1', diagnosis: 'Dx1', plan: 'Plan1' })
    expect(out[1].doctorName).toBe('Dr. Juan Perez')
  })
  it('sin médico asociado usa "Médico"', () => {
    const out = summarizeRecentConsultations([consult({ diagnosis: 'X' })], 5)
    expect(out[0].doctorName).toBe('Médico')
  })
})
