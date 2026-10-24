/**
 * Parámetros de las rutas /api/guardar/* que no son campos del formulario. Viajan en el mismo
 * FormData con prefijo `_` para no chocar con los `name` del formulario.
 */
import type { Medicine } from './medicines'

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
