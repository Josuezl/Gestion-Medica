'use client'

import { useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
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
    const supabase = createClient()
    const filter = patientId ? { filter: `patient_id=eq.${patientId}` } : {}
    const source = { schema: 'public', table: 'preclinical_vitals', ...filter }
    const handle = (row: PreclinicalEventRow | null) => {
      if (row?.id) onChangeRef.current(row)
    }

    // Un `phx_reply: ok` NO garantiza que los bindings se hayan aceptado: si la tabla no está
    // publicada en Realtime, el rechazo llega DESPUÉS en un mensaje `system` con status error,
    // cuando subscribe() ya reportó SUBSCRIBED. Sin esta bandera el canal se reportaba sano, no
    // entregaba nada, y el respaldo nunca despertaba (bug encontrado en E2E, 2026-07-24).
    let bindingsRejected = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    async function setup() {
      // El cliente de navegador de @supabase/ssr arranca la sesión desde cookies y NO le pasa el
      // JWT al socket de Realtime: se conecta anónimo y la RLS (auth.uid() = null) filtra TODOS
      // los eventos, dejando el canal "suscrito" pero mudo. Hay que autenticarlo con el token de
      // la sesión ANTES de suscribir (causa raíz confirmada en E2E: phx_join sin access_token).
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      const token = data.session?.access_token
      if (token) await supabase.realtime.setAuth(token)
      if (cancelled) return

      channel = supabase
        .channel(`preclinical:${patientId ?? 'clinic'}`)
        .on<PreclinicalEventRow>('postgres_changes', { event: 'INSERT', ...source }, (p) => handle(p.new))
        .on<PreclinicalEventRow>('postgres_changes', { event: 'UPDATE', ...source }, (p) => handle(p.new))
        .on('system', {}, (payload: { status?: string } | null) => {
          if (payload?.status !== 'error') return
          bindingsRejected = true
          liveRef.current = false
        })
        .subscribe((status) => {
          liveRef.current = status === 'SUBSCRIBED' && !bindingsRejected
        })
    }
    void setup()

    return () => {
      cancelled = true
      liveRef.current = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [patientId, enabled])

  /** ¿El canal está entregando eventos? Se lee en manejadores, nunca durante el render. */
  const isLive = useCallback(() => liveRef.current, [])

  return { isLive }
}
