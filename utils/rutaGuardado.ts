import { NextRequest, NextResponse } from 'next/server'
import { errorMessage } from '@/utils/errors'

/**
 * Envoltorio común de las rutas /api/guardar/*. Responde 200 con el mismo objeto que devolvía la
 * Server Action (incluidos los `{ error }` de negocio) y 500 ante una excepción inesperada.
 * Las Server Actions comparan Origin con Host contra CSRF; una ruta de API no lo hace sola.
 */
export async function responderGuardado(
  request: NextRequest,
  guardar: (fd: FormData) => Promise<unknown>,
): Promise<NextResponse> {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (origin && host && safeHost(origin) !== host) {
    return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 })
  }

  let fd: FormData
  try {
    fd = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })
  }

  try {
    return NextResponse.json(await guardar(fd))
  } catch (e) {
    console.error('[api/guardar]', request.nextUrl.pathname, errorMessage(e, 'error desconocido'))
    return NextResponse.json({ error: 'No se pudo guardar.' }, { status: 500 })
  }
}

function safeHost(origin: string): string | null {
  try {
    return new URL(origin).host
  } catch {
    return null
  }
}
