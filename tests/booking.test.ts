import { describe, it, expect } from 'vitest'
import {
  PORTAL_SLOT_MINUTES,
  MAX_BOOKING_DAYS,
  hondurasTodayYMD,
  weekdayOfYMD,
  isBlockingStatus,
  generateDaySlots,
  buildAvailability,
  matchPatientByFullName,
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
  it('slots de 1 hora y ventana de 30 días', () => {
    expect(PORTAL_SLOT_MINUTES).toBe(60)
    expect(MAX_BOOKING_DAYS).toBe(30)
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
  it('solo incluye días con al menos un slot, dentro de la ventana de 30 días', () => {
    // Solo lunes 08:00-09:00. Desde el miércoles 2026-07-08, los lunes en ventana: 13, 20, 27 de julio y 3 de agosto.
    const days = buildAvailability([{ weekday: 1, start_time: '08:00', end_time: '09:00' }], [], earlyNow)
    expect(Object.keys(days)).toEqual(['2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03'])
    expect(days['2026-07-13']).toEqual(['08:00'])
  })

  it('incluye "hoy" solo si quedan horas futuras', () => {
    const ranges = [wedRange('08:00', '12:00')]
    const morning = buildAvailability(ranges, [], hn(WED, '07:00'))
    expect(morning[WED]).toEqual(['08:00', '09:00', '10:00', '11:00'])
    const night = buildAvailability(ranges, [], hn(WED, '20:00'))
    expect(night[WED]).toBeUndefined()
  })

  it('la ventana es de exactamente MAX_BOOKING_DAYS días empezando hoy', () => {
    // Horario todos los días => la última fecha ofrecida es hoy + 29.
    const all = [0, 1, 2, 3, 4, 5, 6].map(w => ({ weekday: w, start_time: '08:00', end_time: '09:00' }))
    const days = Object.keys(buildAvailability(all, [], earlyNow))
    expect(days[0]).toBe('2026-07-08')
    expect(days[days.length - 1]).toBe('2026-08-06')
    expect(days).toHaveLength(30)
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
