import type { ConsultationRow } from '@/utils/clinicalTypes'

/** Una fila del historial de «Otros signos vitales» (texto tal cual: hay datos migrados como texto). */
export interface VitalsHistoryRow {
  id: string
  createdAt: string
  temperatura: string | null
  peso: string | null
  talla: string | null
  perimetroCefalico: string | null
  fc: string | null
  fr: string | null
  spo2: string | null
}

const valor = (v: number | string | null | undefined) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim())

/** Signos (sin la presión) de las consultas, de la más reciente a la más antigua; omite las vacías. */
export function vitalsHistory(rows: ConsultationRow[]): VitalsHistoryRow[] {
  return rows
    .filter((r): r is ConsultationRow & { created_at: string } => !!r.created_at)
    .map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      temperatura: valor(r.temperature),
      peso: valor(r.weight),
      talla: valor(r.height),
      perimetroCefalico: valor(r.head_circumference),
      fc: valor(r.heart_rate),
      fr: valor(r.respiratory_rate),
      spo2: valor(r.oxygen_saturation),
    }))
    .filter((r) => r.temperatura || r.peso || r.talla || r.perimetroCefalico || r.fc || r.fr || r.spo2)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
