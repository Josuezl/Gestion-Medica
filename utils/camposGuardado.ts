/**
 * Parámetros de las rutas /api/guardar/* que no son campos del formulario. Viajan en el mismo
 * FormData con prefijo `_` para no chocar con los `name` del formulario.
 */
import type { Medicine } from './medicines'
import { validarEstado, type Denticion, type EstadoOdontograma } from './odontograma'

export function agregarParametros(fd: FormData, p: Record<string, string | null | boolean | unknown[]>): FormData {
  for (const [clave, valor] of Object.entries(p)) {
    if (valor === null) continue
    fd.set(clave, Array.isArray(valor) ? JSON.stringify(valor) : String(valor))
  }
  return fd
}

const ERROR_CONSULTA = 'Datos de la consulta incompletos.'

function texto(fd: FormData, clave: string): string | null {
  const v = fd.get(clave)
  return typeof v === 'string' && v !== '' ? v : null
}

export function leerParametrosConsulta(fd: FormData):
  | { patientId: string; appointmentId: string | null; medicines: Medicine[]; preclinicalVitalsId: string | null }
  | { error: string } {
  const patientId = texto(fd, '_patientId')
  if (!patientId) return { error: ERROR_CONSULTA }
  let medicines: Medicine[] = []
  const raw = texto(fd, '_medicines')
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return { error: ERROR_CONSULTA }
      medicines = parsed as Medicine[]
    } catch {
      return { error: ERROR_CONSULTA }
    }
  }
  return {
    patientId,
    appointmentId: texto(fd, '_appointmentId'),
    medicines,
    preclinicalVitalsId: texto(fd, '_preclinicalVitalsId'),
  }
}

export function leerForce(fd: FormData): boolean {
  return fd.get('_force') === 'true'
}

export interface ParametrosConsultaDental {
  patientId: string
  appointmentId: string | null
  medicines: Medicine[]
  denticion: Denticion
  estado: EstadoOdontograma
}

export function leerParametrosConsultaDental(fd: FormData): ParametrosConsultaDental | { error: string } {
  const consulta = leerParametrosConsulta(fd)
  if ('error' in consulta) return consulta
  const { patientId, appointmentId, medicines } = consulta

  const denticion = texto(fd, '_denticion')
  if (denticion !== 'PERMANENTE' && denticion !== 'TEMPORAL' && denticion !== 'MIXTA') {
    return { error: 'La dentición no es válida.' }
  }

  const raw = texto(fd, '_odontograma')
  if (!raw) return { error: 'Falta el odontograma.' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { error: 'El odontograma no tiene un formato válido.' }
  }

  const validado = validarEstado(parsed)
  if (!validado.ok) return { error: validado.error }
  return { patientId, appointmentId, medicines, denticion, estado: validado.estado }
}
