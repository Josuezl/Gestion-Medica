import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Inbox } from 'lucide-react'
import SolicitudesClient, { type RequestRow } from './SolicitudesClient'

/**
 * Bandeja de solicitudes del portal público de auto-agendamiento (pendientes de aprobación).
 * Para cada solicitud calcula SUGERENCIAS de pacientes que podrían ser la misma persona
 * (misma fecha de nacimiento, misma identidad o apellidos parecidos): es el caso "puso un
 * nombre y un apellido y el sistema pensó que era nuevo" — el staff asigna al verdadero.
 */

export interface PatientSuggestion {
  id: string
  first_name: string
  last_name: string
  birth_date: string | null
  phone: string | null
  id_card: string | null
  reason: string
}

async function findSuggestions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
  request: { matched_patient_id: string | null; submitted_first_name: string; submitted_last_name: string; submitted_birth_date: string | null; submitted_id_card: string | null },
): Promise<PatientSuggestion[]> {
  if (request.matched_patient_id) return [] // ya identificado por nombre exacto
  const suggestions = new Map<string, PatientSuggestion>()
  const SELECT = 'id, first_name, last_name, birth_date, phone, id_card'

  if (request.submitted_birth_date) {
    const { data } = await supabase
      .from('patients')
      .select(SELECT)
      .eq('clinic_id', clinicId)
      .eq('birth_date', request.submitted_birth_date)
      .limit(5)
    for (const p of data || []) suggestions.set(p.id, { ...p, reason: 'Misma fecha de nacimiento' })
  }

  if (request.submitted_id_card) {
    const { data } = await supabase
      .from('patients')
      .select(SELECT)
      .eq('clinic_id', clinicId)
      .ilike('id_card', request.submitted_id_card)
      .limit(3)
    for (const p of data || []) suggestions.set(p.id, { ...p, reason: 'Misma identidad' })
  }

  // Apellidos parecidos: el apellido es la señal fuerte cuando el nombre vino incompleto.
  const lastWords = request.submitted_last_name.trim().split(/\s+/).filter(w => w.length >= 3).slice(0, 2)
  if (lastWords.length > 0 && suggestions.size < 6) {
    let q = supabase.from('patients').select(SELECT).eq('clinic_id', clinicId)
    q = q.or(lastWords.map(w => `last_name.ilike.%${w}%`).join(','))
    // Acotar además por el primer nombre para no traer a media clínica.
    const firstWord = request.submitted_first_name.trim().split(/\s+/)[0]
    if (firstWord && firstWord.length >= 3) q = q.ilike('first_name', `%${firstWord}%`)
    const { data } = await q.limit(4)
    for (const p of data || []) {
      if (!suggestions.has(p.id)) suggestions.set(p.id, { ...p, reason: 'Nombre parecido' })
    }
  }

  return [...suggestions.values()].slice(0, 6)
}

export default async function SolicitudesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) redirect('/login')

  const { data: requests } = await supabase
    .from('booking_requests')
    .select(`
      id, appointment_id, doctor_id, location_id, matched_patient_id, status, created_at, tracking_code,
      submitted_first_name, submitted_last_name, submitted_birth_date, submitted_id_card, submitted_phone,
      appointments ( id, scheduled_at, status ),
      doctor:user_profiles!booking_requests_doctor_id_fkey ( first_name, last_name, gender ),
      locations ( name ),
      matched_patient:patients!booking_requests_matched_patient_id_fkey ( id, first_name, last_name, birth_date, phone, id_card )
    `)
    .eq('clinic_id', profile.clinic_id)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true })

  // La fila de booking_requests con sus joins (a-uno). findSuggestions solo lee submitted_* y
  // matched_patient_id; el resto viaja tal cual a SolicitudesClient. `suggestions` la añade el map.
  const rows = (requests || []) as unknown as Omit<RequestRow, 'suggestions'>[]
  const withSuggestions: RequestRow[] = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      suggestions: await findSuggestions(supabase, profile.clinic_id, r),
    }))
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <Inbox size={24} color="var(--primary)" />
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Solicitudes de cita</h2>
      </div>
      <p style={{ margin: '0 0 1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        Citas agendadas por los pacientes desde el enlace público. El horario queda bloqueado
        hasta que las apruebes o rechaces.
      </p>
      <SolicitudesClient requests={withSuggestions} />
    </div>
  )
}
