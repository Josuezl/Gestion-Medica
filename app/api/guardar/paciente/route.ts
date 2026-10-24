import { NextRequest } from 'next/server'
import { crearPaciente } from '@/utils/guardado/paciente'
import { leerForce } from '@/utils/camposGuardado'
import { responderGuardado } from '@/utils/rutaGuardado'

// Dirección fija entre despliegues (a diferencia del id de una Server Action): no renombrar.
// Al crear responde `{ redirectTo }` y el cliente navega (la acción hace el redirect()).
export function POST(request: NextRequest) {
  return responderGuardado(request, (fd) => crearPaciente(fd, leerForce(fd)))
}
