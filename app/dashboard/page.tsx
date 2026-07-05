import React from 'react'
import { createClient } from '@/utils/supabase/server'
import AgendaClient, { type Appointment } from './AgendaClient'
import DashboardGreeting from './DashboardGreeting'
import { getPendingPreclinicalPatientIds } from './preclinical/actions'
import { getSessionProfile } from '@/utils/session'

import { cookies } from 'next/headers'

// Ventana inicial de la agenda: cubre el uso diario (hoy ± navegación cercana) sin cargar
// todo el historial. Fuera de esto, el cliente pide el mes puntual al servidor.
const AGENDA_PAST_DAYS = 30
const AGENDA_FUTURE_DAYS = 120

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ patientId?: string; nuevaCita?: string }> }) {
  const supabase = await createClient()
  const sp = await searchParams

  // 1. Sesión + perfil memoizados por request (compartidos con layout y greeting, P1-2)
  const session = await getSessionProfile()
  if (!session) return null
  const { profile } = session

  const clinicId = profile?.clinic_id

  // Si venimos de "crear paciente → agendar cita", pre-seleccionar ese paciente en el modal de cita.
  let preSelectedPatient: { id: string; name: string } | null = null
  if (sp.patientId && clinicId) {
    const { data: p } = await supabase
      .from('patients')
      .select('id, first_name, last_name')
      .eq('id', sp.patientId)
      .eq('clinic_id', clinicId)
      .maybeSingle()
    if (p) preSelectedPatient = { id: p.id, name: `${p.first_name} ${p.last_name}`.trim() }
  }

  // Obtener la clínica seleccionada en el inicio de sesión
  const cookieStore = await cookies()
  const defaultLocationId = cookieStore.get('current_location_id')?.value || 'all'

  // 2. Obtener las citas de la clínica en una ventana acotada (P0-1): el costo del dashboard
  // ya no crece con el historial. Al navegar fuera de la ventana, AgendaClient pide el mes
  // que falta con getAppointmentsForRange.
  // (Los pacientes ya no se precargan: el buscador de la agenda usa searchPatientsForAgenda.)
  const rangeStart = new Date()
  rangeStart.setDate(rangeStart.getDate() - AGENDA_PAST_DAYS)
  rangeStart.setHours(0, 0, 0, 0)
  const rangeEnd = new Date()
  rangeEnd.setDate(rangeEnd.getDate() + AGENDA_FUTURE_DAYS)
  rangeEnd.setHours(23, 59, 59, 999)

  const { data: appointments } = await supabase
    .from('appointments')
    .select(`
      id,
      scheduled_at,
      status,
      notes,
      duration_minutes,
      doctor_id,
      location_id,
      patients (
        id,
        first_name,
        last_name,
        phone,
        id_card,
        gender,
        birth_date
      ),
      booking_requests (
        id,
        status,
        submitted_first_name,
        submitted_last_name,
        submitted_phone
      )
    `)
    .eq('clinic_id', clinicId || '')
    .gte('scheduled_at', rangeStart.toISOString())
    .lte('scheduled_at', rangeEnd.toISOString())
    .order('scheduled_at', { ascending: true })

  // 4. Obtener doctores de la clínica
  const { data: doctors } = await supabase
    .from('user_profiles')
    .select('id, first_name, last_name, role, gender')
    .eq('clinic_id', clinicId || '')
    .in('role', ['ADMIN', 'DOCTOR'])
    .order('first_name', { ascending: true })

  // 5. Obtener clínicas
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, is_active')
    .eq('clinic_id', clinicId || '')
    .eq('is_active', true)
    .order('name', { ascending: true })

  // 6. Pacientes con pre-clínica pendiente de hoy (para marcar las citas con "Signos listos")
  const preclinicalPatientIds = await getPendingPreclinicalPatientIds()

  return (
    <>
      <DashboardGreeting />
      <AgendaClient
        initialAppointments={(appointments as unknown as Appointment[]) || []}
        loadedRangeStart={rangeStart.toISOString()}
        loadedRangeEnd={rangeEnd.toISOString()}
        doctors={doctors || []}
        locations={locations || []}
        defaultLocationId={defaultLocationId}
        preclinicalPatientIds={preclinicalPatientIds}
        preSelectedPatient={preSelectedPatient}
        autoOpenAppointment={sp.nuevaCita === '1'}
        currentDoctor={{
          id: profile?.id || '',
          role: profile?.role || 'DOCTOR',
          isOrgAdmin: !!profile?.is_org_admin
        }}
      />
    </>
  )
}
