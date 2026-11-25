import { describe, expect, it } from 'vitest'
import { rutaNuevaConsulta } from '@/utils/rutaConsulta'

describe('rutaNuevaConsulta', () => {
  it('abre una consulta médica sin cita', () => {
    expect(rutaNuevaConsulta('p1', null, false)).toBe('/dashboard/consultations/new?patientId=p1')
  })

  it('conserva la cita al abrir una consulta médica', () => {
    expect(rutaNuevaConsulta('p1', 'a1', false)).toBe('/dashboard/consultations/new?patientId=p1&appointmentId=a1')
  })

  it('abre una consulta dental con la cita del odontólogo', () => {
    expect(rutaNuevaConsulta('p1', 'a1', true)).toBe('/dashboard/odontologia/consulta/nueva?patientId=p1&appointmentId=a1')
  })
})
