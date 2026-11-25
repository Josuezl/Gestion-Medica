import type { NextRequest } from 'next/server'
import { leerParametrosConsultaDental } from '@/utils/camposGuardado'
import { guardarConsultaDental } from '@/utils/guardado/consulta-dental'
import { responderGuardado } from '@/utils/rutaGuardado'

// Dirección fija: no renombrar.
export function POST(request: NextRequest) {
  return responderGuardado(request, async (fd) => {
    const p = leerParametrosConsultaDental(fd)
    if ('error' in p) return p
    return guardarConsultaDental(p, fd)
  })
}
