import { headers } from 'next/headers'

/**
 * IP del cliente para las acciones públicas del portal (rate limiting, regla de "una solicitud
 * pendiente por IP" y auditoría). En Vercel llega en `x-forwarded-for` (el primer valor es el
 * cliente). Puede faltar (p. ej. en local): los llamadores tratan null como "sin regla de IP".
 */
export async function getClientIp(): Promise<string | null> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  if (first) return first.slice(0, 45)
  const real = h.get('x-real-ip')?.trim()
  return real ? real.slice(0, 45) : null
}
