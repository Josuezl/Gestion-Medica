import { describe, it, expect } from 'vitest'
import {
  BP_FORM_MARKER,
  bpFormValuesFromFormData,
  bpRecordFromForm,
  bpFormFieldsFromRow,
  validateBloodPressure,
  bpReadings,
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
