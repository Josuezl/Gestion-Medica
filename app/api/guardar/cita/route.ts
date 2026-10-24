import { NextRequest } from 'next/server'
import { crearCita } from '@/utils/guardado/cita'
import { responderGuardado } from '@/utils/rutaGuardado'

// Dirección fija entre despliegues (a diferencia del id de una Server Action): no renombrar.
export function POST(request: NextRequest) {
  return responderGuardado(request, crearCita)
}
