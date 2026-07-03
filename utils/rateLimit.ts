import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Rate limiting pragmático para los endpoints públicos del portal de agendamiento.
 *
 * En serverless (Vercel) la memoria del proceso no sirve como contador, así que los eventos
 * van a la tabla `booking_rate_events` (solo accesible con service_role). Cada chequeo borra
 * los eventos vencidos del mismo bucket, con lo que la tabla se auto-limpia sin cron.
 *
 * Best-effort: ante un error de BD se permite el paso (fail-open) — la protección real de
 * integridad la dan las validaciones y el RPC atómico; esto solo frena el abuso barato.
 *
 * @param bucket p. ej. `id:<ip>` / `book:<ip>` — un contador independiente por acción+IP.
 */
export async function checkRateLimit(
  admin: SupabaseClient,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString()

  await admin.from('booking_rate_events').delete().eq('bucket', bucket).lt('created_at', cutoff)

  const { count } = await admin
    .from('booking_rate_events')
    .select('id', { count: 'exact', head: true })
    .eq('bucket', bucket)
    .gte('created_at', cutoff)
  if ((count ?? 0) >= limit) return false

  await admin.from('booking_rate_events').insert({ bucket })
  return true
}
