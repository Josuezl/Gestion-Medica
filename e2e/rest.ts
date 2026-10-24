import { statusSupabaseLocal } from './entorno'
import { validarEntornoE2e } from './guardia-entorno'

/** Clínica sembrada por supabase/seed.sql («Clínica de Prueba E2E»). */
export const CLINICA_E2E = '00000000-0000-4000-a000-000000000001'

/** PostgREST de la Supabase LOCAL con la service role; el candado rechaza cualquier otra base. */
export async function rest(path: string, init: RequestInit = {}) {
  const status = statusSupabaseLocal()
  validarEntornoE2e({ url: status.API_URL, serviceKey: status.SERVICE_ROLE_KEY })
  const res = await fetch(`${status.API_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: status.SERVICE_ROLE_KEY,
      Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  if (!res.ok) throw new Error(`REST ${path}: ${res.status} ${await res.text()}`)
  const texto = await res.text() // PATCH/POST sin `Prefer: return=representation` responden vacío
  return texto ? JSON.parse(texto) : null
}
