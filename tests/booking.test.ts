import { describe, it, expect } from 'vitest'
import {
  PORTAL_SLOT_MINUTES,
  hondurasTodayYMD,
  weekdayOfYMD,
  isBlockingStatus,
  generateDaySlots,
  buildAvailability,
  bookingWindowEndYMD,
  matchPatientByFullName,
  matchPatientRecord,
  splitFullName,
  normalizeIdCard,
  isDateBlocked,
  validateScheduleRanges,
  schedulesForLocation,
  type ScheduleRange,
  type BlockingAppointment,
} from '@/utils/booking'

// Helpers de armado: los instantes se construyen SIEMPRE con -06:00 (Honduras), como el resto del repo.
const hn = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00-06:00`)
const appt = (ymd: string, hhmm: string, duration = 15, status = 'PENDING'): BlockingAppointment => ({
  scheduled_at: hn(ymd, hhmm).toISOString(),
  duration_minutes: duration,
  status,
})

// Miércoles 2026-07-08 (weekday 3). "now" por defecto: muy temprano ese día.
const WED = '2026-07-08'
const wedRange = (start: string, end: string): ScheduleRange => ({ weekday: 3, start_time: start, end_time: end })
const earlyNow = hn(WED, '00:30')

describe('constantes del portal', () => {
  it('slots de 1 hora', () => {
    expect(PORTAL_SLOT_MINUTES).toBe(60)
  })
})

describe('bookingWindowEndYMD (ventana de 3 meses calendario)', () => {
  it('desde julio se ofrece hasta el último día de septiembre', () => {
    expect(bookingWindowEndYMD('2026-07-08')).toBe('2026-09-30')
    expect(bookingWindowEndYMD('2026-07-31')).toBe('2026-09-30')
  })

  it('cruza el año: desde diciembre se ofrece hasta fin de febrero', () => {
    expect(bookingWindowEndYMD('2026-12-15')).toBe('2027-02-28')
    expect(bookingWindowEndYMD('2027-12-01')).toBe('2028-02-29') // 2028 bisiesto
  })
})

describe('hondurasTodayYMD', () => {
  it('devuelve la fecha calendario de Honduras, no la UTC', () => {
    // 01:30 UTC del 9 de julio = 19:30 del 8 de julio en Honduras (UTC-6)
    expect(hondurasTodayYMD(new Date('2026-07-09T01:30:00Z'))).toBe('2026-07-08')
    expect(hondurasTodayYMD(new Date('2026-07-09T12:00:00Z'))).toBe('2026-07-09')
  })
})

describe('weekdayOfYMD', () => {
  it('usa la convención de Date.getDay(): 0=domingo..6=sábado', () => {
    expect(weekdayOfYMD('2026-07-08')).toBe(3) // miércoles
    expect(weekdayOfYMD('2026-07-05')).toBe(0) // domingo
    expect(weekdayOfYMD('2026-07-11')).toBe(6) // sábado
  })

  it('no se corre un día en bordes de mes/año (bug clásico de new Date("YYYY-MM-DD") en UTC)', () => {
    expect(weekdayOfYMD('2026-01-01')).toBe(4) // jueves
    expect(weekdayOfYMD('2025-12-31')).toBe(3) // miércoles
    expect(weekdayOfYMD('2026-03-01')).toBe(0) // domingo
  })
})

describe('isBlockingStatus', () => {
  it('las canceladas y no-show liberan el slot; todo lo demás bloquea', () => {
    expect(isBlockingStatus('CANCELLED')).toBe(false)
    expect(isBlockingStatus('NO_SHOW')).toBe(false)
    expect(isBlockingStatus('PENDING')).toBe(true)
    expect(isBlockingStatus('CONFIRMED')).toBe(true)
    expect(isBlockingStatus('COMPLETED')).toBe(true)
    expect(isBlockingStatus('PENDING_REVIEW')).toBe(true)
  })
})

describe('generateDaySlots', () => {
  it('genera slots de 1 hora dentro del rango', () => {
    expect(generateDaySlots([wedRange('08:00', '12:00')], WED, [], earlyNow))
      .toEqual(['08:00', '09:00', '10:00', '11:00'])
  })

  it('excluye el slot que no cabe completo antes del fin del rango', () => {
    expect(generateDaySlots([wedRange('08:00', '11:30')], WED, [], earlyNow))
      .toEqual(['08:00', '09:00', '10:00'])
  })

  it('acepta horas de Postgres con segundos (HH:MM:SS)', () => {
    expect(generateDaySlots([wedRange('08:00:00', '10:00:00')], WED, [], earlyNow))
      .toEqual(['08:00', '09:00'])
  })

  it('combina varios rangos del mismo día, ordenados', () => {
    expect(generateDaySlots([wedRange('14:00', '16:00'), wedRange('08:00', '10:00')], WED, [], earlyNow))
      .toEqual(['08:00', '09:00', '14:00', '15:00'])
  })

  it('día sin horario configurado => sin slots', () => {
    expect(generateDaySlots([{ weekday: 1, start_time: '08:00', end_time: '12:00' }], WED, [], earlyNow))
      .toEqual([])
  })

  it('una cita interna corta (08:15, 15 min) mata el slot de 08:00 pero no el de 09:00', () => {
    const slots = generateDaySlots([wedRange('08:00', '10:00')], WED, [appt(WED, '08:15', 15)], earlyNow)
    expect(slots).toEqual(['09:00'])
  })

  it('una cita que TERMINA justo al inicio del slot no lo bloquea (07:30 + 30min => 08:00 libre)', () => {
    const slots = generateDaySlots([wedRange('08:00', '09:00')], WED, [appt(WED, '07:30', 30)], earlyNow)
    expect(slots).toEqual(['08:00'])
  })

  it('una cita sin duration_minutes cuenta como 15 min (default del sistema)', () => {
    const noDuration: BlockingAppointment = { scheduled_at: hn(WED, '08:50').toISOString(), duration_minutes: null, status: 'PENDING' }
    // 08:50 + 15min = 09:05 => bloquea 08:00 Y 09:00
    expect(generateDaySlots([wedRange('08:00', '11:00')], WED, [noDuration], earlyNow)).toEqual(['10:00'])
  })

  it('las citas CANCELLED y NO_SHOW no bloquean; PENDING_REVIEW y COMPLETED sí', () => {
    const slots = generateDaySlots(
      [wedRange('08:00', '12:00')],
      WED,
      [appt(WED, '08:00', 60, 'CANCELLED'), appt(WED, '09:00', 60, 'NO_SHOW'), appt(WED, '10:00', 60, 'PENDING_REVIEW'), appt(WED, '11:00', 60, 'COMPLETED')],
      earlyNow,
    )
    expect(slots).toEqual(['08:00', '09:00'])
  })

  it('excluye slots que ya pasaron (hoy a las 10:30 solo queda el de 11:00)', () => {
    const slots = generateDaySlots([wedRange('08:00', '12:00')], WED, [], hn(WED, '10:30'))
    expect(slots).toEqual(['11:00'])
  })

  it('un slot que empieza exactamente "ahora" ya no se ofrece', () => {
    const slots = generateDaySlots([wedRange('08:00', '10:00')], WED, [], hn(WED, '08:00'))
    expect(slots).toEqual(['09:00'])
  })
})

describe('buildAvailability', () => {
  it('solo incluye días con al menos un slot, dentro de la ventana de 3 meses', () => {
    // Solo lunes 08:00-09:00. Desde el miércoles 2026-07-08: todos los lunes hasta fin de septiembre.
    const days = buildAvailability([{ weekday: 1, start_time: '08:00', end_time: '09:00' }], [], earlyNow)
    const keys = Object.keys(days)
    expect(keys[0]).toBe('2026-07-13')
    expect(keys[keys.length - 1]).toBe('2026-09-28')
    expect(keys).toHaveLength(12) // 3 lunes de julio + 5 de agosto + 4 de septiembre
    expect(days['2026-07-13']).toEqual(['08:00'])
  })

  it('incluye "hoy" solo si quedan horas futuras', () => {
    const ranges = [wedRange('08:00', '12:00')]
    const morning = buildAvailability(ranges, [], hn(WED, '07:00'))
    expect(morning[WED]).toEqual(['08:00', '09:00', '10:00', '11:00'])
    const night = buildAvailability(ranges, [], hn(WED, '20:00'))
    expect(night[WED]).toBeUndefined()
  })

  it('la ventana va de hoy al último día del mes actual + 2 (Julio → fin de Septiembre)', () => {
    const all = [0, 1, 2, 3, 4, 5, 6].map(w => ({ weekday: w, start_time: '08:00', end_time: '09:00' }))
    const days = Object.keys(buildAvailability(all, [], earlyNow))
    expect(days[0]).toBe('2026-07-08')
    expect(days[days.length - 1]).toBe('2026-09-30')
    expect(days).toHaveLength(24 + 31 + 30) // resto de julio + agosto + septiembre
  })

  it('descuenta las citas ocupadas del día correspondiente', () => {
    const days = buildAvailability([wedRange('08:00', '10:00')], [appt(WED, '08:00', 60)], earlyNow)
    expect(days[WED]).toEqual(['09:00'])
  })
})

describe('matchPatientByFullName', () => {
  const p = (id: string, first: string, last: string) => ({ id, first_name: first, last_name: last })

  it('encuentra al paciente sin importar acentos, mayúsculas ni espacios extra', () => {
    const found = matchPatientByFullName([p('a', 'José María', 'Pérez López')], '  jose  maria ', 'perez lopez')
    expect(found?.id).toBe('a')
  })

  it('compara el nombre COMPLETO aunque el corte nombre/apellido difiera', () => {
    // En la BD quedó "Maria" / "Jose Lopez Garcia"; el paciente escribe "Maria Jose" / "Lopez Garcia".
    const found = matchPatientByFullName([p('a', 'Maria', 'Jose Lopez Garcia')], 'Maria Jose', 'Lopez Garcia')
    expect(found?.id).toBe('a')
  })

  it('0 coincidencias => null (pasa al flujo de registro)', () => {
    expect(matchPatientByFullName([p('a', 'Ana', 'Gómez')], 'Juan', 'Pérez')).toBeNull()
  })

  it('más de 1 coincidencia => null (ambiguo: lo resuelve el staff al aprobar)', () => {
    const patients = [p('a', 'Juan Carlos', 'Pérez'), p('b', 'JUAN CARLOS', 'PEREZ')]
    expect(matchPatientByFullName(patients, 'Juan Carlos', 'Pérez')).toBeNull()
  })

  it('nombre vacío o solo símbolos => null', () => {
    expect(matchPatientByFullName([p('a', '', '')], '', '')).toBeNull()
  })
})

describe('isDateBlocked y bloqueos en buildAvailability (vacaciones/congresos)', () => {
  it('un día dentro del rango bloqueado (bordes inclusivos) está bloqueado', () => {
    const blocks = [{ start_date: '2026-07-10', end_date: '2026-07-12' }]
    expect(isDateBlocked('2026-07-09', blocks)).toBe(false)
    expect(isDateBlocked('2026-07-10', blocks)).toBe(true)
    expect(isDateBlocked('2026-07-11', blocks)).toBe(true)
    expect(isDateBlocked('2026-07-12', blocks)).toBe(true)
    expect(isDateBlocked('2026-07-13', blocks)).toBe(false)
  })

  it('sin bloqueos nada se bloquea', () => {
    expect(isDateBlocked('2026-07-10', [])).toBe(false)
  })

  it('buildAvailability omite los días bloqueados y conserva el resto', () => {
    const all = [0, 1, 2, 3, 4, 5, 6].map(w => ({ weekday: w, start_time: '08:00', end_time: '09:00' }))
    const blocks = [{ start_date: '2026-07-10', end_date: '2026-07-12' }, { start_date: '2026-08-01', end_date: '2026-08-31' }]
    const days = buildAvailability(all, [], earlyNow, blocks)
    expect(days['2026-07-09']).toBeDefined()
    expect(days['2026-07-10']).toBeUndefined()
    expect(days['2026-07-12']).toBeUndefined()
    expect(days['2026-07-13']).toBeDefined()
    expect(days['2026-08-15']).toBeUndefined() // agosto completo de vacaciones
    expect(days['2026-09-01']).toBeDefined()
  })

  it('buildAvailability sin el parámetro de bloqueos sigue funcionando (compatibilidad)', () => {
    const all = [{ weekday: 3, start_time: '08:00', end_time: '09:00' }]
    expect(buildAvailability(all, [], earlyNow)[WED]).toEqual(['08:00'])
  })
})

describe('splitFullName (caja única: dos nombres + dos apellidos)', () => {
  it('con 4 palabras: 2 nombres + 2 apellidos', () => {
    expect(splitFullName('María José López García')).toEqual({ firstName: 'María José', lastName: 'López García', words: 4 })
  })

  it('con 5+ palabras: los 2 últimos son apellidos, el resto nombres', () => {
    expect(splitFullName('Ana María de Jesús Pérez López')).toEqual({ firstName: 'Ana María de Jesús', lastName: 'Pérez López', words: 6 })
  })

  it('con 3 palabras: 1 nombre + 2 apellidos', () => {
    expect(splitFullName('Juan Pérez López')).toEqual({ firstName: 'Juan', lastName: 'Pérez López', words: 3 })
  })

  it('con 2 palabras: 1 y 1', () => {
    expect(splitFullName('Juan Pérez')).toEqual({ firstName: 'Juan', lastName: 'Pérez', words: 2 })
  })

  it('colapsa espacios extra y cuenta bien las palabras', () => {
    expect(splitFullName('  Zulema   Karina  Portalprueba   Uno ')).toEqual({ firstName: 'Zulema Karina', lastName: 'Portalprueba Uno', words: 4 })
  })

  it('vacío => 0 palabras', () => {
    expect(splitFullName('   ')).toEqual({ firstName: '', lastName: '', words: 0 })
  })
})

describe('normalizeIdCard', () => {
  it('deja solo letras y números, en minúsculas (guiones/espacios fuera)', () => {
    expect(normalizeIdCard('0801-1990-12345')).toBe('0801199012345')
    expect(normalizeIdCard(' 0801 1990 12345 ')).toBe('0801199012345')
    expect(normalizeIdCard('ABC-123')).toBe('abc123')
  })

  it('null/vacío => cadena vacía', () => {
    expect(normalizeIdCard(null)).toBe('')
    expect(normalizeIdCard('---')).toBe('')
  })
})

describe('matchPatientRecord (identidad primero, luego nombre completo)', () => {
  const patients = [
    { id: 'a', first_name: 'María', last_name: 'Jose Lopez Garcia', id_card: '0801-1990-12345' },
    { id: 'b', first_name: 'Pedro Pablo', last_name: 'Mejía Cruz', id_card: null },
    { id: 'c', first_name: 'Carmen', last_name: 'Díaz', id_card: '0801-1985-54321' },
  ]

  it('la identidad manda: encuentra al paciente aunque el nombre venga escrito distinto', () => {
    expect(matchPatientRecord(patients, 'Mari Jose Lopez G', '0801199012345')?.id).toBe('a')
  })

  it('sin identidad: matching por nombre completo normalizado', () => {
    expect(matchPatientRecord(patients, 'pedro pablo mejia cruz', null)?.id).toBe('b')
  })

  it('identidad que no existe: cae al matching por nombre', () => {
    expect(matchPatientRecord(patients, 'Carmen Díaz', '9999-9999-99999')?.id).toBe('c')
  })

  it('ni identidad ni nombre coinciden => null', () => {
    expect(matchPatientRecord(patients, 'Nadie Conocido Apellido Raro', null)).toBeNull()
  })

  it('dos pacientes con la misma identidad => la identidad no decide (ambiguo) y decide el nombre', () => {
    const dup = [...patients, { id: 'd', first_name: 'Otra', last_name: 'Persona', id_card: '0801 1990 12345' }]
    expect(matchPatientRecord(dup, 'Maria Jose Lopez Garcia', '0801-1990-12345')?.id).toBe('a')
  })
})

describe('schedulesForLocation (horario por sede con fallback al general)', () => {
  const general = (weekday: number): ScheduleRange & { location_id: string | null } =>
    ({ weekday, start_time: '08:00', end_time: '12:00', location_id: null })
  const sede = (weekday: number, loc: string): ScheduleRange & { location_id: string | null } =>
    ({ weekday, start_time: '14:00', end_time: '17:00', location_id: loc })

  it('si la sede tiene horario propio, usa SOLO ese (no lo mezcla con el general)', () => {
    const rows = [general(1), general(2), sede(1, 'loc-a')]
    expect(schedulesForLocation(rows, 'loc-a')).toEqual([sede(1, 'loc-a')])
  })

  it('si la sede NO tiene horario propio, cae al horario general del médico', () => {
    const rows = [general(1), general(2), sede(1, 'loc-a')]
    expect(schedulesForLocation(rows, 'loc-b')).toEqual([general(1), general(2)])
  })

  it('link sin sede (clínica sin locations) usa el horario general', () => {
    const rows = [general(3), sede(3, 'loc-a')]
    expect(schedulesForLocation(rows, null)).toEqual([general(3)])
  })

  it('sin ninguna fila devuelve vacío', () => {
    expect(schedulesForLocation([], 'loc-a')).toEqual([])
    expect(schedulesForLocation([], null)).toEqual([])
  })
})

describe('validateScheduleRanges', () => {
  it('acepta rangos válidos, incluso varios por día si no se solapan', () => {
    expect(validateScheduleRanges([
      { weekday: 1, start: '08:00', end: '12:00' },
      { weekday: 1, start: '14:00', end: '17:00' },
      { weekday: 3, start: '08:00', end: '12:00' },
    ])).toBeNull()
  })

  it('rangos consecutivos que se tocan (fin == inicio) son válidos', () => {
    expect(validateScheduleRanges([
      { weekday: 1, start: '08:00', end: '10:00' },
      { weekday: 1, start: '10:00', end: '12:00' },
    ])).toBeNull()
  })

  it('rechaza formato de hora inválido', () => {
    expect(validateScheduleRanges([{ weekday: 1, start: '8am', end: '12:00' }])).not.toBeNull()
    expect(validateScheduleRanges([{ weekday: 1, start: '25:00', end: '26:00' }])).not.toBeNull()
  })

  it('rechaza fin <= inicio', () => {
    expect(validateScheduleRanges([{ weekday: 1, start: '12:00', end: '08:00' }])).not.toBeNull()
    expect(validateScheduleRanges([{ weekday: 1, start: '08:00', end: '08:00' }])).not.toBeNull()
  })

  it('rechaza solape entre rangos del mismo día (pero permite mismas horas en días distintos)', () => {
    expect(validateScheduleRanges([
      { weekday: 1, start: '08:00', end: '12:00' },
      { weekday: 1, start: '11:00', end: '14:00' },
    ])).not.toBeNull()
    expect(validateScheduleRanges([
      { weekday: 1, start: '08:00', end: '12:00' },
      { weekday: 2, start: '08:00', end: '12:00' },
    ])).toBeNull()
  })

  it('rechaza weekday fuera de 0..6', () => {
    expect(validateScheduleRanges([{ weekday: 7, start: '08:00', end: '12:00' }])).not.toBeNull()
  })
})
