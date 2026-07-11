/**
 * Reportes de errores del cliente (navegador) hacia el equipo técnico. Módulo puro y testeable:
 * valida/normaliza el payload que llega al endpoint /api/client-errors y arma el HTML del correo.
 * NO debe incluir datos clínicos del paciente — solo metadatos técnicos del fallo.
 */

export const CLIENT_ERROR_KINDS = ['save_failed', 'save_timeout'] as const
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number]

export interface ClientErrorReport {
  kind: ClientErrorKind
  /** Mensaje técnico del error (truncado; puede venir del navegador, nunca confiable). */
  message: string
  /** Ruta de la página donde ocurrió (sin query string, para no filtrar identificadores). */
  page: string
  userAgent: string
  /** navigator.onLine al momento del fallo (si reportó, tenía internet para el POST). */
  onLine: boolean
  /** Cuánto tardó en fallar el guardado, en ms. */
  durationMs: number
}

const MAX_MESSAGE = 500
const MAX_PAGE = 300
const MAX_USER_AGENT = 300

function asTruncatedString(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

function isClientErrorKind(v: unknown): v is ClientErrorKind {
  return typeof v === 'string' && (CLIENT_ERROR_KINDS as readonly string[]).includes(v)
}

/** Valida y normaliza el body del POST. Devuelve null si no tiene la forma mínima esperada. */
export function parseClientErrorReport(body: unknown): ClientErrorReport | null {
  if (typeof body !== 'object' || body === null) return null
  const o = body as Record<string, unknown>
  if (!isClientErrorKind(o.kind)) return null

  const durationRaw = typeof o.durationMs === 'number' && Number.isFinite(o.durationMs) ? o.durationMs : 0
  return {
    kind: o.kind,
    message: asTruncatedString(o.message, MAX_MESSAGE),
    page: asTruncatedString(o.page, MAX_PAGE),
    userAgent: asTruncatedString(o.userAgent, MAX_USER_AGENT),
    onLine: typeof o.onLine === 'boolean' ? o.onLine : true,
    durationMs: Math.max(0, Math.round(durationRaw)),
  }
}

// Escapa datos no confiables antes de interpolarlos en el HTML del correo.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const KIND_LABEL: Record<ClientErrorKind, string> = {
  save_failed: 'fallo de guardado',
  save_timeout: 'guardado colgado (timeout)',
}

export function clientErrorReportSubject(kind: ClientErrorKind, clinicName: string): string {
  return `⚠️ CloudMedHN: ${KIND_LABEL[kind]} — ${clinicName}`
}

export interface ClientErrorContext {
  userName: string
  clinicName: string
  role: string
  /** Fecha/hora legible en zona de Honduras. */
  when: string
}

export function clientErrorReportToHtml(report: ClientErrorReport, ctx: ClientErrorContext): string {
  const row = (label: string, value: string) => `
      <tr>
        <td style="padding:6px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;white-space:nowrap;">${label}</td>
        <td style="padding:6px 12px;border:1px solid #e2e8f0;font-family:monospace;font-size:13px;word-break:break-all;">${value}</td>
      </tr>`

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:640px;">
    <h2 style="color:#b91c1c;">⚠️ Fallo de guardado reportado desde el navegador</h2>
    <p>Un guardado de consulta falló <strong>teniendo internet</strong> (el navegador pudo enviar este reporte),
    así que la causa probable es del lado del servidor o de la versión de la app (deploy con pestañas abiertas).</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">
      ${row('Tipo', escapeHtml(KIND_LABEL[report.kind]))}
      ${row('Cuándo', escapeHtml(ctx.when))}
      ${row('Usuario', escapeHtml(ctx.userName))}
      ${row('Rol', escapeHtml(ctx.role))}
      ${row('Clínica', escapeHtml(ctx.clinicName))}
      ${row('Página', escapeHtml(report.page))}
      ${row('Tardó en fallar', `${report.durationMs} ms`)}
      ${row('navigator.onLine', report.onLine ? 'true' : 'false')}
      ${row('Error técnico', escapeHtml(report.message || '(sin mensaje)'))}
      ${row('Navegador', escapeHtml(report.userAgent))}
    </table>
    <p style="font-size:12px;color:#64748b;margin-top:16px;">
      El médico vio el mensaje de error en pantalla y su borrador local quedó respaldado — no perdió datos.
      Este correo no incluye información clínica del paciente.
    </p>
  </div>`
}
