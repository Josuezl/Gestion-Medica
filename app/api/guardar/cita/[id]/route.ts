import { NextRequest } from 'next/server'
import { actualizarCita } from '@/utils/guardado/cita'
import { responderGuardado } from '@/utils/rutaGuardado'

// Dirección fija entre despliegues (a diferencia del id de una Server Action): no renombrar.
export async function POST(request: NextRequest, ctx: RouteContext<'/api/guardar/cita/[id]'>) {
  const { id } = await ctx.params
  return responderGuardado(request, (fd) => actualizarCita(id, fd))
}
