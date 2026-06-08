import React from 'react'
import { createClient } from '@/utils/supabase/server'
import AgendaClient from './AgendaClient'

export default async function AgendaPage() {
  const supabase = await createClient()

  // 1. Validar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, clinic_id, first_name, last_name, role')
    .eq('id', user.id)
    .single()

  const clinicId = profile?.clinic_id

  // 2. Obtener lista de pacientes para el buscador/selector de citas
  const { data: patients } = await supabase
    .from('patients')
    .select('id, first_name, last_name, phone, birth_date, gender, id_card')
    .eq('clinic_id', clinicId || '')
    .order('last_name', { ascending: true })

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
    .select('id, first_name, last_name, role')
    .eq('clinic_id', clinicId || '')
    .in('role', ['ADMIN', 'DOCTOR'])
    .order('first_name', { ascending: true })

  return (
    <AgendaClient
      patients={patients || []}
      initialAppointments={(appointments as any) || []}
      doctors={doctors || []}
      currentDoctor={{
        id: profile?.id || '',
        role: profile?.role || 'DOCTOR'
      }}
    />
  )
}
