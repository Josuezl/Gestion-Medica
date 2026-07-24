'use client'

import { useCallback, useEffect, useRef } from 'react'
import { subscribeWithAuth } from '@/utils/realtimeChannel'
import type { AppointmentEventRow } from '@/utils/appointmentSync'

/**
 * Escucha en vivo la tabla `appointments` (INSERT/UPDATE/DELETE) para que los cambios de citas
 * de otro usuario aparezcan solos en la agenda. Sin filtro de columna: la RLS por clínica acota.
 * El DELETE trae la fila previa (requiere `replica identity full`, migración 20260725000000).
 */
export function useRealtimeAppointments({
  enabled = true,
  onEvent,
}: {
  enabled?: boolean
  onEvent: (eventType: 'INSERT' | 'UPDATE' | 'DELETE', row: AppointmentEventRow) => void
}): { isLive: () => boolean } {
  const onEventRef = useRef(onEvent)
  useEffect(() => { onEventRef.current = onEvent })

  const liveRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const table = 'appointments'
    const emit = (type: 'INSERT' | 'UPDATE' | 'DELETE') =>
      (newRow: Record<string, unknown>, oldRow: Record<string, unknown>) => {
        const raw = (type === 'DELETE' ? oldRow : newRow) as unknown as AppointmentEventRow
        if (raw?.id) onEventRef.current(type, raw)
      }
    const sub = subscribeWithAuth('appointments:clinic', [
      { event: 'INSERT', schema: 'public', table, handler: emit('INSERT') },
      { event: 'UPDATE', schema: 'public', table, handler: emit('UPDATE') },
      { event: 'DELETE', schema: 'public', table, handler: emit('DELETE') },
    ])
    const poll = setInterval(() => { liveRef.current = sub.isLive() }, 1000)
    return () => { clearInterval(poll); liveRef.current = false; sub.teardown() }
  }, [enabled])

  const isLive = useCallback(() => liveRef.current, [])
  return { isLive }
}
