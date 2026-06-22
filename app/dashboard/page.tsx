import React from 'react'
import { createClient } from '@/utils/supabase/server'
import AgendaClient from './AgendaClient'
import { getPendingPreclinicalPatientIds } from './preclinical/actions'

import { cookies } from 'next/headers'

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ patientId?: string; nuevaCita?: string }> }) {
  const supabase = await createClient()
  const sp = await searchParams

  // 1. Validar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, clinic_id, first_name, last_name, role, is_org_admin')
    .eq('id', user.id)
    .single()

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

  // 2. Obtener lista de pacientes para el buscador/selector de citas
  // Límite explícito de 5000 para superar el cap por defecto de Supabase (1000 filas).
  // Para clínicas muy grandes (>5000 pacientes) se deberá migrar a búsqueda dinámica por API.
  const { data: patients } = await supabase
    .from('patients')
    .select('id, first_name, last_name, phone, birth_date, gender, id_card')
    .eq('clinic_id', clinicId || '')
    .order('last_name', { ascending: true })
    .limit(5000)

  // 3. Obtener lista de citas activas de la clínica
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
      )
    `)
    .eq('clinic_id', clinicId || '')
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
    <AgendaClient
      patients={patients || []}
      initialAppointments={(appointments as any) || []}
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
  )
}
