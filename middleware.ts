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
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
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

  // Rutas que requieren autenticación
  const isDashboardRoute = request.nextUrl.pathname.startsWith('/dashboard')
  // Rutas de autenticación
  const isAuthRoute = request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/register'

  // Redirigir a login si intenta entrar a dashboard sin estar autenticado
  if (!user && isDashboardRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirigir a dashboard si intenta entrar a login/register estando ya autenticado
  if (user && isAuthRoute) {
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
     */
    '/((?!_next/static|_next/image|favicon.ico|api/whatsapp-webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
