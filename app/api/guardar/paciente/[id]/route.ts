import { NextRequest } from 'next/server'
import { actualizarPaciente } from '@/utils/guardado/paciente'
import { responderGuardado } from '@/utils/rutaGuardado'

// Dirección fija entre despliegues (a diferencia del id de una Server Action): no renombrar.
export async function POST(request: NextRequest, ctx: RouteContext<'/api/guardar/paciente/[id]'>) {
  const { id } = await ctx.params
  return responderGuardado(request, (fd) => actualizarPaciente(id, fd))
}
