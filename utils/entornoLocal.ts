/**
 * Lógica pura del desarrollo contra Supabase local (Docker).
 * `scripts/dev-local.mjs` la usa para arrancar Next con las variables locales en el entorno del
 * proceso, que tienen prioridad sobre `.env.local` (las claves reales de la nube).
 * Solo sintaxis "borrable" de TypeScript: Node la importa directo desde el .mjs.
 */

const URLS_LOCALES = ['http://127.0.0.1:54321', 'http://localhost:54321']

/** Puerto de `npm run dev` en este proyecto (el 3000 lo usa Control). */
export const PUERTO_DEV = 2000

/** `true` solo para la API de Supabase local (puerto 54321), con o sin `/` final. */
export function esUrlLocal(url: string | undefined): boolean {
  if (!url) return false
  return URLS_LOCALES.includes(url.replace(/\/$/, ''))
}

/**
 * Variables para `next dev` a partir de `supabase status -o env`.
 * Apaga los envíos reales (correo, WhatsApp, IA) dejando sus claves vacías.
 */
export function variablesDevLocal(status: Record<string, string>): Record<string, string> {
  const url = status.API_URL
  if (!esUrlLocal(url) || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
    throw new Error('Supabase local no está corriendo: npm run db:local')
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SITE_URL: `http://localhost:${PUERTO_DEV}`,
    RESEND_API_KEY: '',
    WHATSAPP_ACCESS_TOKEN: '',
    GEMINI_API_KEY: '',
  }
}
