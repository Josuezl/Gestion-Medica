/**
 * Candado de las E2E: se niegan a correr si Supabase no es la LOCAL (Docker). Las pruebas crean y
 * borran datos; contra la nube tocarían pacientes reales.
 */
import { esUrlLocal } from '../utils/entornoLocal'

export function validarEntornoE2e(env: { url?: string; serviceKey?: string }): void {
  if (!esUrlLocal(env.url)) throw new Error('E2E bloqueadas: NEXT_PUBLIC_SUPABASE_URL no es local')
  if (!env.serviceKey) throw new Error('E2E bloqueadas: falta SUPABASE_SERVICE_ROLE_KEY local')
}
