import { test, expect } from 'vitest'
import { agregarParametros, leerParametrosConsulta, leerParametrosConsultaDental, leerForce } from '@/utils/camposGuardado'

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

function formularioDental() {
  return agregarParametros(new FormData(), {
    _patientId: 'p1',
    _appointmentId: 'a1',
    _medicines: [{ name: 'X' }],
    _denticion: 'MIXTA',
    _odontograma: JSON.stringify({
      version: 1,
      piezas: { '36': { caras: { O: { hallazgo: 'CARIES', estado: 'PENDIENTE', extra: true } } } },
      regiones: {},
    }),
  })
}

test.each([
  ['_patientId', null],
  ['_odontograma', '{roto'],
  ['_odontograma', '{"version":1,"piezas":{"99":{}},"regiones":{}}'],
  ['_denticion', 'OTRA'],
])('rechaza parámetros dentales inválidos en %s con valor %s', (campo, valor) => {
  const fd = formularioDental()
  if (valor === null) fd.delete(campo)
  else fd.set(campo, valor)
  expect(leerParametrosConsultaDental(fd)).toEqual({ error: expect.any(String) })
})

test('lee los parámetros dentales y devuelve el odontograma limpio', () => {
  expect(leerParametrosConsultaDental(formularioDental())).toEqual({
    patientId: 'p1',
    appointmentId: 'a1',
    medicines: [{ name: 'X' }],
    denticion: 'MIXTA',
    estado: {
      version: 1,
      piezas: { '36': { caras: { O: { hallazgo: 'CARIES', estado: 'PENDIENTE' } } } },
      regiones: {},
    },
  })
})
