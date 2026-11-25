import type { ConsultationRow } from './clinicalTypes'

export type ConsultaConTipo = ConsultationRow & {
  tipo?: string | null
  intraoral_exam?: string | null
  procedures_done?: string | null
}

export function etiquetaTipoConsulta(tipo: string | null | undefined): 'Odontología' | null {
  return tipo === 'DENTAL' ? 'Odontología' : null
}
