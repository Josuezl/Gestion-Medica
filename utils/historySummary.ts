/**
 * Lógica pura del "resumen del historial" que se muestra al iniciar una consulta.
 * Es un reporte armado desde las consultas ya cargadas (no hay IA ni llamadas externas).
 */
import type { ConsultationRow } from './clinicalTypes'
import { doctorShortName, personShortName } from './doctorName'

/** "Paciente masculino/femenino de X años" según género ('M'/'F') y edad ya calculada. */
export function patientIntro(gender: string | null | undefined, age: number): string {
  const sexo = gender === 'F' ? 'femenino' : gender === 'M' ? 'masculino' : null
  const who = sexo ? `Paciente ${sexo}` : 'Paciente'
  if (!age || age <= 0) return who
  return `${who} de ${age} año${age === 1 ? '' : 's'}`
}

/**
 * Encabezado del resumen: "{Primer nombre} {Primer apellido}, paciente masculino de X años".
 * Si no hay nombre, cae al intro sin nombre ("Paciente masculino de X años").
 */
export function summaryHeadline(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  gender: string | null | undefined,
  age: number,
): string {
  const name = personShortName(firstName, lastName)
  const intro = patientIntro(gender, age)
  if (!name) return intro
  return `${name}, ${intro.charAt(0).toLowerCase()}${intro.slice(1)}`
}

export interface DiagnosisCount {
  label: string
  count: number
}

/**
 * Acorta una etiqueta a una sola línea con "…" cuando excede `max` caracteres. Se usa en el eje del
 * gráfico para que los diagnósticos largos no se enciman; el texto completo se ve en el tooltip.
 */
export function truncateLabel(text: string, max = 24): string {
  const t = (text ?? '').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

/**
 * Frecuencia de cada diagnóstico en TODO el historial. Agrupa por texto normalizado
 * (mayúsculas + espacios colapsados) para unir "Gripe común" y "GRIPE  común"; conserva la
 * primera forma vista como etiqueta. Ordena por frecuencia desc y luego alfabético.
 */
export function aggregateDiagnoses(consultations: ConsultationRow[]): DiagnosisCount[] {
  const map = new Map<string, DiagnosisCount>()
  for (const c of consultations) {
    const raw = (c.diagnosis ?? '').trim()
    if (!raw) continue
    const key = raw.toUpperCase().replace(/\s+/g, ' ')
    const existing = map.get(key)
    if (existing) existing.count++
    else map.set(key, { label: raw.replace(/\s+/g, ' '), count: 1 })
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'))
}

export interface ConsultationSummaryItem {
  date: string
  doctorName: string
  symptoms: string
  diagnosis: string
  plan: string
}

/**
 * Toma las primeras `limit` consultas (ya vienen ordenadas de más reciente a más antigua) y extrae
 * los campos clave para el resumen: fecha, médico, síntomas, diagnóstico y plan de tratamiento.
 */
export function summarizeRecentConsultations(consultations: ConsultationRow[], limit = 5): ConsultationSummaryItem[] {
  return consultations.slice(0, limit).map((c) => ({
    date: c.created_at,
    doctorName: c.user_profiles
      ? doctorShortName(c.user_profiles.first_name, c.user_profiles.last_name, c.user_profiles.gender)
      : 'Médico',
    symptoms: (c.symptoms ?? '').trim(),
    diagnosis: (c.diagnosis ?? '').trim(),
    plan: (c.treatment_plan ?? '').trim(),
  }))
}
