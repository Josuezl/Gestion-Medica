import { describe, it, expect } from 'vitest'
import {
  BP_FORM_MARKER,
  bpFormValuesFromFormData,
  bpRecordFromForm,
  bpFormFieldsFromRow,
  validateBloodPressure,
  bpReadings,
  bpLevel,
  bpHistory,
  type BpFormValues,
} from '@/utils/bloodPressure'

function values(overrides: Partial<BpFormValues> = {}): BpFormValues {
  return { reading: '', arm: '', both: false, second: '', ...overrides }
}

describe('bpFormValuesFromFormData', () => {
  it('devuelve null en formularios sin la marca (pestaña de antes del despliegue)', () => {
    const fd = new FormData()
    fd.set('blood_pressure', '120/80')
    expect(bpFormValuesFromFormData(fd)).toBeNull()
  })

  it('lee lectura, brazo, ambos y segunda lectura', () => {
    const fd = new FormData()
    fd.set(BP_FORM_MARKER, '1')
    fd.set('blood_pressure', ' 120/80 ')
    fd.set('blood_pressure_arm', 'right')
    fd.set('blood_pressure_both', 'on')
    fd.set('blood_pressure_second', '125/82')
    expect(bpFormValuesFromFormData(fd)).toEqual({ reading: '120/80', arm: 'right', both: true, second: '125/82' })
  })

  it('ignora un brazo desconocido', () => {
    const fd = new FormData()
    fd.set(BP_FORM_MARKER, '1')
    fd.set('blood_pressure_arm', 'otro')
    expect(bpFormValuesFromFormData(fd)?.arm).toBe('')
  })
})

describe('bpRecordFromForm', () => {
  it('un brazo: la lectura va a su columna y a blood_pressure', () => {
    expect(bpRecordFromForm(values({ reading: '120/80', arm: 'right' }))).toEqual({
      blood_pressure: '120/80', blood_pressure_left: null, blood_pressure_right: '120/80',
    })
  })

  it('sin brazo: solo blood_pressure (tenants donde es opcional)', () => {
    expect(bpRecordFromForm(values({ reading: '120/80' }))).toEqual({
      blood_pressure: '120/80', blood_pressure_left: null, blood_pressure_right: null,
    })
  })

  it('ambos brazos: izquierdo es la lectura principal', () => {
    expect(bpRecordFromForm(values({ reading: '120/80', both: true, second: '125/82', arm: 'right' }))).toEqual({
      blood_pressure: '120/80', blood_pressure_left: '120/80', blood_pressure_right: '125/82',
    })
  })

  it('ambos brazos con solo el derecho: blood_pressure toma el derecho', () => {
    expect(bpRecordFromForm(values({ both: true, second: '125/82' }))).toEqual({
      blood_pressure: '125/82', blood_pressure_left: null, blood_pressure_right: '125/82',
    })
  })

  it('vacío: todo null', () => {
    expect(bpRecordFromForm(values({ arm: 'left' }))).toEqual({
      blood_pressure: null, blood_pressure_left: null, blood_pressure_right: null,
    })
  })
})

describe('bpFormFieldsFromRow', () => {
  it('fila antigua sin brazo', () => {
    expect(bpFormFieldsFromRow({ blood_pressure: '118/76' })).toEqual({
      blood_pressure: '118/76', blood_pressure_arm: '', blood_pressure_both: '', blood_pressure_second: '',
    })
  })

  it('un solo brazo', () => {
    expect(bpFormFieldsFromRow({ blood_pressure: '120/80', blood_pressure_right: '120/80' })).toEqual({
      blood_pressure: '120/80', blood_pressure_arm: 'right', blood_pressure_both: '', blood_pressure_second: '',
    })
  })

  it('ambos brazos', () => {
    expect(bpFormFieldsFromRow({ blood_pressure: '120/80', blood_pressure_left: '120/80', blood_pressure_right: '125/82' })).toEqual({
      blood_pressure: '120/80', blood_pressure_arm: '', blood_pressure_both: 'on', blood_pressure_second: '125/82',
    })
  })

  it('ida y vuelta con bpRecordFromForm', () => {
    const record = bpRecordFromForm(values({ reading: '130/85', arm: 'left' }))
    expect(bpFormFieldsFromRow(record).blood_pressure_arm).toBe('left')
  })
})

describe('validateBloodPressure', () => {
  it('no obligatorio: siempre válido', () => {
    expect(validateBloodPressure(values(), false)).toBeNull()
  })

  it('obligatorio: exige lectura', () => {
    expect(validateBloodPressure(values({ arm: 'left' }), true)).toMatch(/obligatoria/)
  })

  it('obligatorio: el brazo es opcional', () => {
    expect(validateBloodPressure(values({ reading: '120/80' }), true)).toBeNull()
  })

  it('obligatorio: lectura + brazo es válido', () => {
    expect(validateBloodPressure(values({ reading: '120/80', arm: 'left' }), true)).toBeNull()
  })

  it('obligatorio en ambos brazos: basta uno', () => {
    expect(validateBloodPressure(values({ both: true, second: '125/82' }), true)).toBeNull()
    expect(validateBloodPressure(values({ both: true }), true)).toMatch(/al menos un brazo/)
  })
})

describe('bpReadings', () => {
  it('con brazos, una lectura por brazo', () => {
    expect(bpReadings({ blood_pressure: '120/80', blood_pressure_left: '120/80', blood_pressure_right: '125/82' })).toEqual([
      { arm: 'left', value: '120/80' }, { arm: 'right', value: '125/82' },
    ])
  })

  it('sin brazos, la lectura general', () => {
    expect(bpReadings({ blood_pressure: '118/76' })).toEqual([{ arm: null, value: '118/76' }])
  })

  it('sin nada, vacío', () => {
    expect(bpReadings({})).toEqual([])
  })
})

describe('bpLevel', () => {
  it('normal solo si sistólica < 120 y diastólica < 80', () => {
    expect(bpLevel('118/76')).toBe('normal')
    expect(bpLevel('120/70')).toBe('elevada')
    expect(bpLevel('110/80')).toBe('elevada')
  })

  it('alta si la sistólica o la diastólica llega al límite', () => {
    expect(bpLevel('140/70')).toBe('alta')
    expect(bpLevel('130/90')).toBe('alta')
    expect(bpLevel('139/89')).toBe('elevada')
  })

  it('texto que no es una lectura: sin nivel', () => {
    expect(bpLevel('')).toBeNull()
    expect(bpLevel('alta')).toBeNull()
    expect(bpLevel(' 125 / 82 ')).toBe('elevada')
  })
})

describe('bpHistory', () => {
  it('ordena de la más reciente a la más antigua y descarta consultas sin presión', () => {
    const h = bpHistory([
      { id: 'a', created_at: '2026-08-01T15:00:00Z', blood_pressure: '118/76' },
      { id: 'b', created_at: '2026-10-24T15:00:00Z', blood_pressure: '145/95', blood_pressure_left: '145/95', blood_pressure_right: '140/90' },
      { id: 'c', created_at: '2026-09-12T15:00:00Z', blood_pressure: null },
    ])
    expect(h.map((r) => r.id)).toEqual(['b', 'a'])
    expect(h[0]).toMatchObject({ sinBrazo: null, izquierdo: '145/95', derecho: '140/90' })
    expect(h[1]).toMatchObject({ sinBrazo: '118/76', izquierdo: null, derecho: null })
  })
})

describe('vitalsHistory', () => {
  it('ordena, convierte a texto y omite consultas sin signos', async () => {
    const { vitalsHistory } = await import('@/utils/historialSignos')
    const h = vitalsHistory([
      { id: 'a', created_at: '2026-05-22T15:00:00Z', temperature: 36.6, weight: 71.2, heart_rate: 76 },
      { id: 'b', created_at: '2026-06-29T15:00:00Z', temperature: 36.8, oxygen_saturation: 98 },
      { id: 'c', created_at: '2026-07-01T15:00:00Z', blood_pressure: '120/80' },
    ])
    expect(h.map((r) => r.id)).toEqual(['b', 'a'])
    expect(h[1]).toMatchObject({ temperatura: '36.6', peso: '71.2', fc: '76', talla: null })
  })
})
