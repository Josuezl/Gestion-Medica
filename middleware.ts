import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Obtener el usuario actual de forma segura
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Rutas que requieren autenticación
  const isDashboardRoute = pathname.startsWith('/dashboard')
  // Solo /login es ruta de entrada. El registro público está deshabilitado.
  const isAuthRoute = pathname === '/login'
  // El flujo de fijar contraseña llega desde el email SIN sesión previa: debe permitirse.
  const isSetPasswordFlow = pathname.startsWith('/set-password') || pathname.startsWith('/auth/confirm')

  // Redirigir a login si intenta entrar al dashboard sin estar autenticado
  if (!user && isDashboardRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Defensa en profundidad: /superadmin exige sesión (la autorización real la valida el RPC en la página)
  if (!user && pathname.startsWith('/superadmin')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirigir a dashboard si intenta entrar a login estando ya autenticado
  // (no aplica al flujo de set-password, donde el usuario recién obtiene sesión para fijar su clave)
  if (user && isAuthRoute && !isSetPasswordFlow) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Coincidir con todas las rutas de solicitud excepto:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico (icono de favicon)
     * - archivos con extensiones comunes (svg, png, jpg, etc.)
     * - ruta del webhook de whatsapp (importante permitir acceso público)
     * - portal público de agendamiento (/agendar) y estado de cita (/citas): son
     *   anónimas por diseño; excluirlas evita el getUser() de Supabase en ese tráfico
     */
    '/((?!_next/static|_next/image|favicon.ico|api/whatsapp-webhook|agendar|citas|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
