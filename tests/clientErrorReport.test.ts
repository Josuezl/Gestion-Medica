import { describe, it, expect } from 'vitest'
import { parseClientErrorReport, clientErrorReportToHtml, clientErrorReportSubject } from '@/utils/clientErrorReport'

const valido = {
  kind: 'save_failed',
  message: 'Failed to find Server Action "abc123"',
  page: '/dashboard/consultations/new',
  userAgent: 'Mozilla/5.0 (Macintosh)',
  onLine: true,
  durationMs: 1523,
}

describe('parseClientErrorReport', () => {
  it('acepta un reporte válido', () => {
    const r = parseClientErrorReport(valido)
    expect(r).not.toBeNull()
    expect(r!.kind).toBe('save_failed')
    expect(r!.durationMs).toBe(1523)
  })

  it('rechaza no-objetos y null', () => {
    expect(parseClientErrorReport(null)).toBeNull()
    expect(parseClientErrorReport('texto')).toBeNull()
    expect(parseClientErrorReport(42)).toBeNull()
  })

  it('rechaza kind desconocido o faltante', () => {
    expect(parseClientErrorReport({ ...valido, kind: 'otra_cosa' })).toBeNull()
    expect(parseClientErrorReport({ ...valido, kind: undefined })).toBeNull()
  })

  it('acepta save_timeout como kind', () => {
    expect(parseClientErrorReport({ ...valido, kind: 'save_timeout' })!.kind).toBe('save_timeout')
  })

  it('trunca message/page/userAgent largos', () => {
    const r = parseClientErrorReport({
      ...valido,
      message: 'x'.repeat(2000),
      page: 'y'.repeat(2000),
      userAgent: 'z'.repeat(2000),
    })
    expect(r!.message.length).toBeLessThanOrEqual(500)
    expect(r!.page.length).toBeLessThanOrEqual(300)
    expect(r!.userAgent.length).toBeLessThanOrEqual(300)
  })

  it('normaliza durationMs inválido a 0', () => {
    expect(parseClientErrorReport({ ...valido, durationMs: 'rápido' })!.durationMs).toBe(0)
    expect(parseClientErrorReport({ ...valido, durationMs: -5 })!.durationMs).toBe(0)
    expect(parseClientErrorReport({ ...valido, durationMs: Infinity })!.durationMs).toBe(0)
  })

  it('onLine no booleano se normaliza a true (el cliente solo reporta con internet)', () => {
    expect(parseClientErrorReport({ ...valido, onLine: 'sí' })!.onLine).toBe(true)
  })
})

describe('clientErrorReportToHtml', () => {
  const ctx = { userName: 'Dr. Josue Zuniga', clinicName: 'Centro Medico de Prueba', role: 'DOCTOR', when: '10/07/2026, 05:30 p. m.' }

  it('incluye los datos del contexto y del reporte', () => {
    const html = clientErrorReportToHtml(parseClientErrorReport(valido)!, ctx)
    expect(html).toContain('Dr. Josue Zuniga')
    expect(html).toContain('Centro Medico de Prueba')
    expect(html).toContain('Failed to find Server Action')
    expect(html).toContain('/dashboard/consultations/new')
    expect(html).toContain('1523')
  })

  it('escapa HTML malicioso del mensaje (anti-XSS en el correo)', () => {
    const r = parseClientErrorReport({ ...valido, message: '<script>alert(1)</script>' })!
    const html = clientErrorReportToHtml(r, { ...ctx, clinicName: '<img src=x>' })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('clientErrorReportSubject', () => {
  it('incluye la clínica y el tipo de fallo', () => {
    expect(clientErrorReportSubject('save_timeout', 'Clínica San Martín')).toBe(
      '⚠️ CloudMedHN: guardado colgado (timeout) — Clínica San Martín'
    )
    expect(clientErrorReportSubject('save_failed', 'X')).toBe('⚠️ CloudMedHN: fallo de guardado — X')
  })
})
