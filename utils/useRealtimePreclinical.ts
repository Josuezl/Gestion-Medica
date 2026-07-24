'use client'

import { useCallback, useEffect, useRef } from 'react'
import { subscribeWithAuth } from '@/utils/realtimeChannel'
import type { PreclinicalVitalsRow } from '@/utils/clinicalTypes'

/**
 * Escucha en vivo la tabla `preclinical_vitals` (INSERT y UPDATE) para que los signos que toma
 * la asistente aparezcan solos en la pantalla del médico, sin recargar.
 *
 * El WebSocket va del navegador DIRECTO a Supabase: no pasa por Vercel, así que tener el canal
 * abierto todo el día no consume funciones ni CPU. El payload trae la fila completa, de modo
 * que ni el badge de la agenda ni el autollenado necesitan consultar al servidor.
 *
 * Aislamiento: Realtime aplica la RLS de la tabla (política por clinic_id). Si el token no
 * llegara a viajar, el resultado es que NO llegan eventos — nunca datos de otra clínica.
 *
 * Requiere que la tabla esté publicada:
 *   alter publication supabase_realtime add table preclinical_vitals;
 * (migración 20260724000000_preclinical_vitals_realtime.sql)
 */

/** Fila tal como viaja en el evento: sin joins, y con las columnas de control que sí trae. */
export type PreclinicalEventRow = PreclinicalVitalsRow & {
  consumed_at?: string | null
  clinic_id?: string
}

export function useRealtimePreclinical({
  patientId = null,
  enabled = true,
  onChange,
}: {
  /** Si viene, solo se escucha a ese paciente; si no, a toda la clínica (RLS la acota). */
  patientId?: string | null
  enabled?: boolean
  onChange: (row: PreclinicalEventRow) => void
}) {
  // El callback cambia en cada render del componente padre; guardarlo en un ref evita
  // resuscribir el canal (y perder eventos) por una identidad nueva.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  // Salud del canal, en un ref para no provocar renders: el respaldo la consulta al volver a
  // la pestaña y decide si hace falta reconsultar al servidor.
  const liveRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const filter = patientId ? `patient_id=eq.${patientId}` : undefined
    const handler = (newRow: Record<string, unknown>) => {
      const row = newRow as unknown as PreclinicalEventRow
      if (row?.id) onChangeRef.current(row)
    }
    const sub = subscribeWithAuth(`preclinical:${patientId ?? 'clinic'}`, [
      { event: 'INSERT', schema: 'public', table: 'preclinical_vitals', filter, handler },
      { event: 'UPDATE', schema: 'public', table: 'preclinical_vitals', filter, handler },
    ])
    // subscribeWithAuth guarda `live` internamente; se refleja aquí con un poll de 1s (el
    // respaldo solo lee isLive() al volver a la pestaña, no necesita precisión sub-segundo).
    const poll = setInterval(() => { liveRef.current = sub.isLive() }, 1000)
    return () => { clearInterval(poll); liveRef.current = false; sub.teardown() }
  }, [patientId, enabled])

  /** ¿El canal está entregando eventos? Se lee en manejadores, nunca durante el render. */
  const isLive = useCallback(() => liveRef.current, [])

  return { isLive }
}
