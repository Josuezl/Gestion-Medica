import { test, expect } from 'vitest'
import { agregarParametros, leerParametrosConsulta, leerForce } from '@/utils/camposGuardado'

test('agrega parámetros con prefijo y omite los null', () => {
  const fd = agregarParametros(new FormData(), { _patientId: 'p1', _appointmentId: null, _force: true, _medicines: [{ name: 'X' }] })
  expect(fd.get('_patientId')).toBe('p1')
  expect(fd.has('_appointmentId')).toBe(false)
  expect(fd.get('_force')).toBe('true')
  expect(JSON.parse(String(fd.get('_medicines')))).toEqual([{ name: 'X' }])
})
test('lee los parámetros de la consulta', () => {
  const fd = agregarParametros(new FormData(), { _patientId: 'p1', _medicines: [] })
  expect(leerParametrosConsulta(fd)).toEqual({ patientId: 'p1', appointmentId: null, medicines: [], preclinicalVitalsId: null })
})
test('sin paciente o con medicinas rotas: error claro', () => {
  expect(leerParametrosConsulta(new FormData())).toEqual({ error: 'Datos de la consulta incompletos.' })
  const fd = new FormData(); fd.set('_patientId', 'p1'); fd.set('_medicines', '{roto')
  expect(leerParametrosConsulta(fd)).toEqual({ error: 'Datos de la consulta incompletos.' })
})
test('force solo con "true"', () => {
  const fd = new FormData(); expect(leerForce(fd)).toBe(false)
  fd.set('_force', 'true'); expect(leerForce(fd)).toBe(true)
})
