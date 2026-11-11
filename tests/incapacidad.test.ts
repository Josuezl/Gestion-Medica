import { describe, it, expect } from 'vitest'
import { leaveEndDate, formatYmd, validateLeave, leavePeriodText, leaveFromFormData, leaveSummaryText, validateReferral } from '@/utils/incapacidad'

describe('leaveEndDate', () => {
  it('cuenta el día de inicio', () => {
    expect(leaveEndDate('2026-11-01', 1)).toBe('2026-11-01')
    expect(leaveEndDate('2026-11-01', 3)).toBe('2026-11-03')
  })

  it('cruza fin de mes y de año', () => {
    expect(leaveEndDate('2026-02-27', 3)).toBe('2026-03-01')
    expect(leaveEndDate('2026-12-30', 5)).toBe('2027-01-03')
  })

  it('devuelve null con datos incompletos o inválidos', () => {
    expect(leaveEndDate(null, 3)).toBeNull()
    expect(leaveEndDate('2026-11-01', 0)).toBeNull()
    expect(leaveEndDate('2026-11-01', 2.5)).toBeNull()
    expect(leaveEndDate('2026-02-30', 2)).toBeNull()
  })
})

describe('validateLeave', () => {
  it('sin fecha ni días no valida nada (registro de texto libre)', () => {
    expect(validateLeave({ startDate: null, days: null, reason: 'texto' })).toBeNull()
  })

  it('exige fecha, días enteros en rango, diagnóstico e indicaciones', () => {
    const ok = { startDate: '2026-11-01', days: 3, reason: 'Reposo', diagnosis: 'Faringitis' }
    expect(validateLeave(ok)).toBeNull()
    expect(validateLeave({ ...ok, startDate: null })).toContain('fecha')
    expect(validateLeave({ ...ok, days: 0 })).toContain('días')
    expect(validateLeave({ ...ok, days: 400 })).toContain('días')
    expect(validateLeave({ ...ok, diagnosis: null })).toContain('diagnóstico')
    expect(validateLeave({ ...ok, reason: null })).toContain('indicaciones')
  })
})

describe('formato', () => {
  it('formatYmd usa dd/mm/aaaa', () => {
    expect(formatYmd('2026-11-01')).toBe('01/11/2026')
    expect(formatYmd(null)).toBe('')
  })

  it('leavePeriodText arma la frase del impreso', () => {
    expect(leavePeriodText('2026-11-01', 3)).toBe('Por 3 días, del 01/11/2026 al 03/11/2026.')
    expect(leavePeriodText('2026-11-01', 1)).toBe('Por 1 día, del 01/11/2026 al 01/11/2026.')
    expect(leavePeriodText(null, null)).toBeNull()
  })
})

describe('leaveFromFormData', () => {
  it('lee los campos y trata vacíos como null', () => {
    const fd = new FormData()
    fd.set('leave_start_date', '2026-11-01')
    fd.set('leave_days', '3')
    fd.set('medical_leave', '  Reposo  ')
    fd.set('leave_diagnosis', 'Faringitis')
    expect(leaveFromFormData(fd)).toEqual({ startDate: '2026-11-01', days: 3, reason: 'Reposo', diagnosis: 'Faringitis' })
    expect(leaveFromFormData(new FormData())).toEqual({ startDate: null, days: null, reason: null, diagnosis: null })
  })
})

describe('leaveSummaryText', () => {
  it('nombra los días de la semana y aclara que ambas fechas cuentan', () => {
    expect(leaveSummaryText('2026-10-31', 3)).toBe('3 días, del sábado 31 de octubre al lunes 2 de noviembre, ambas fechas inclusive.')
    expect(leaveSummaryText('2026-10-31', 1)).toBe('1 día, el sábado 31 de octubre.')
  })

  it('agrega el año solo si el periodo cruza de año', () => {
    expect(leaveSummaryText('2026-12-30', 5)).toBe('5 días, del miércoles 30 de diciembre de 2026 al domingo 3 de enero de 2027, ambas fechas inclusive.')
  })

  it('null con datos incompletos', () => {
    expect(leaveSummaryText('', 3)).toBeNull()
    expect(leaveSummaryText('2026-10-31', null)).toBeNull()
  })
})

describe('validateReferral', () => {
  it('exige destinatario y motivo', () => {
    expect(validateReferral({ to: '', reason: 'Dolor lumbar crónico' })).toMatch(/dirigida/)
    expect(validateReferral({ to: '   ', reason: 'Dolor lumbar crónico' })).toMatch(/dirigida/)
    expect(validateReferral({ to: 'Ortopedia', reason: '' })).toMatch(/motivo/)
    expect(validateReferral({ to: 'Ortopedia', reason: '  \n ' })).toMatch(/motivo/)
  })

  it('acepta una referencia completa', () => {
    expect(validateReferral({ to: 'Ortopedia', reason: 'Dolor lumbar crónico' })).toBeNull()
  })
})
