import { createClient } from '@supabase/supabase-js'

/**
 * Cliente de Supabase con SERVICE_ROLE.
 *
 * ⚠️ Ignora RLS por completo. Úsalo ÚNICAMENTE dentro de Server Actions o Route Handlers
 * que ya hayan validado autorización (is_platform_admin / requireOrgAdmin). NUNCA lo importes
 * desde un Client Component: la SERVICE_ROLE_KEY no debe llegar nunca al navegador.
 *
 * No persiste sesión ni refresca tokens: cada llamada es una operación administrativa puntual.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
