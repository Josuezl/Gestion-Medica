import { NextRequest } from 'next/server'
import { guardarConsulta } from '@/utils/guardado/consulta'
import { leerParametrosConsulta } from '@/utils/camposGuardado'
import { responderGuardado } from '@/utils/rutaGuardado'

// Dirección fija entre despliegues (a diferencia del id de una Server Action): no renombrar.
export function POST(request: NextRequest) {
  return responderGuardado(request, async (fd) => {
    const p = leerParametrosConsulta(fd)
    if ('error' in p) return p
    return guardarConsulta(p.patientId, p.appointmentId, p.medicines, fd, p.preclinicalVitalsId)
  })
}
