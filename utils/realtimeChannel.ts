'use client'

import { createClient } from '@/utils/supabase/client'

/**
 * Base compartida de Realtime. Centraliza el fix del socket anónimo: con @supabase/ssr el
 * socket NO recibe el JWT del usuario al arrancar de cookies, así que hay que hacer
 * setAuth(token) ANTES de subscribe() o la RLS (auth.uid() = null) filtra TODOS los eventos.
 * También vigila el evento `system`: si los bindings son rechazados (p. ej. tabla no publicada
 * en Realtime), el rechazo llega DESPUÉS de que subscribe() reportó SUBSCRIBED, no en su status.
 */
export interface PostgresBinding {
  event: 'INSERT' | 'UPDATE' | 'DELETE'
  schema: string
  table: string
  /** Filtro de columna estilo `patient_id=eq.<id>`; sin él se escucha toda la tabla (RLS acota). */
  filter?: string
  /** newRow: fila nueva (INSERT/UPDATE). oldRow: fila previa (UPDATE/DELETE con replica identity full). */
  handler: (newRow: Record<string, unknown>, oldRow: Record<string, unknown>) => void
}

export function subscribeWithAuth(
  channelName: string,
  bindings: PostgresBinding[],
): { isLive: () => boolean; teardown: () => void } {
  const supabase = createClient()
  let bindingsRejected = false
  let live = false
  let cancelled = false
  let channel: ReturnType<typeof supabase.channel> | null = null

  async function setup() {
    const { data } = await supabase.auth.getSession()
    if (cancelled) return
    const token = data.session?.access_token
    if (token) await supabase.realtime.setAuth(token)
    if (cancelled) return

    let ch = supabase.channel(channelName)
    for (const b of bindings) {
      const source = b.filter
        ? { event: b.event, schema: b.schema, table: b.table, filter: b.filter }
        : { event: b.event, schema: b.schema, table: b.table }
      ch = ch.on<Record<string, unknown>>('postgres_changes', source, (p) => {
        b.handler(p.new ?? {}, p.old ?? {})
      })
    }
    channel = ch
      .on('system', {}, (payload: { status?: string } | null) => {
        if (payload?.status !== 'error') return
        bindingsRejected = true
        live = false
      })
      .subscribe((status) => {
        live = status === 'SUBSCRIBED' && !bindingsRejected
      })
  }
  void setup()

  return {
    isLive: () => live,
    teardown: () => {
      cancelled = true
      live = false
      if (channel) supabase.removeChannel(channel)
    },
  }
}
