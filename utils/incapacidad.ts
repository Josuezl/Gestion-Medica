// Incapacidad médica y referencia con campos propios (inicio, días, «Dirigido a»). Lógica pura y
// testeable: la usan el formulario, el guardado y los impresos. Las fechas son de calendario
// ('YYYY-MM-DD'), sin hora ni zona: se suman días en UTC para que no las mueva el horario local.

export const MAX_LEAVE_DAYS = 365

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

function parseYmd(value: string): Date | null {
  const m = YMD.exec(value)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  // Rechaza fechas imposibles (2026-02-30 se convertiría en marzo).
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null
  return d
}

/** Último día de la incapacidad, contando el de inicio: 3 días desde el 1 terminan el 3. */
export function leaveEndDate(start: string | null | undefined, days: number | null | undefined): string | null {
  if (!start || !days || !Number.isInteger(days) || days < 1) return null
  const d = parseYmd(start)
  if (!d) return null
  d.setUTCDate(d.getUTCDate() + days - 1)
  return d.toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' → 'dd/mm/aaaa' (formato de los impresos en Honduras). */
export function formatYmd(value: string | null | undefined): string {
  if (!value) return ''
  const m = YMD.exec(value)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value
}

export interface LeaveInput {
  startDate: string | null
  days: number | null
  /** Indicaciones (columna medical_leave). */
  reason: string | null
  /** Diagnóstico propio de la constancia; no se copia solo de la consulta. */
  diagnosis?: string | null
}

/** Lee la incapacidad del formulario. Sin inicio ni días = formulario viejo o texto libre. */
export function leaveFromFormData(formData: FormData): LeaveInput {
  const startDate = String(formData.get('leave_start_date') ?? '').trim() || null
  const daysText = String(formData.get('leave_days') ?? '').trim()
  const days = daysText ? Number(daysText) : null
  const reason = String(formData.get('medical_leave') ?? '').trim() || null
  const diagnosis = String(formData.get('leave_diagnosis') ?? '').trim() || null
  return { startDate, days, reason, diagnosis }
}

/** Mensaje de error o null. Con fecha o días, todos los datos son obligatorios. */
export function validateLeave({ startDate, days, reason, diagnosis }: LeaveInput): string | null {
  if (!startDate && days === null) return null
  if (!startDate || !parseYmd(startDate)) return 'Incapacidad: indica una fecha de inicio válida.'
  if (days === null || !Number.isInteger(days) || days < 1 || days > MAX_LEAVE_DAYS) {
    return `Incapacidad: los días deben ser un número entero entre 1 y ${MAX_LEAVE_DAYS}.`
  }
  if (!diagnosis) return 'Incapacidad: escribe el diagnóstico.'
  if (!reason) return 'Incapacidad: escribe las indicaciones.'
  return null
}

/** Frase del impreso: «Por 3 días, del 01/11/2026 al 03/11/2026.» (null si es un registro viejo). */
export function leavePeriodText(start: string | null | undefined, days: number | null | undefined): string | null {
  const end = leaveEndDate(start, days)
  if (!end || !days) return null
  return `Por ${days} ${days === 1 ? 'día' : 'días'}, del ${formatYmd(start)} al ${formatYmd(end)}.`
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/**
 * Resumen bajo el formulario: «3 días, del sábado 31 de octubre al lunes 2 de noviembre, ambas
 * fechas inclusive.» El año solo aparece si el periodo cruza de año.
 */
export function leaveSummaryText(start: string | null | undefined, days: number | null | undefined): string | null {
  const endYmd = leaveEndDate(start, days)
  const ini = start ? parseYmd(start) : null
  const fin = endYmd ? parseYmd(endYmd) : null
  if (!ini || !fin || !days) return null
  const conAnio = ini.getUTCFullYear() !== fin.getUTCFullYear()
  const largo = (d: Date) => `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}${conAnio ? ` de ${d.getUTCFullYear()}` : ''}`
  if (days === 1) return `1 día, el ${largo(ini)}.`
  return `${days} días, del ${largo(ini)} al ${largo(fin)}, ambas fechas inclusive.`
}
