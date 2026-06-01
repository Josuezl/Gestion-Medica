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
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  const clinicId = profile?.clinic_id

  // 2. Obtener lista de pacientes para el buscador/selector de citas
  const { data: patients } = await supabase
    .from('patients')
    .select('id, first_name, last_name, phone')
    .eq('clinic_id', clinicId || '')
    .order('last_name', { ascending: true })

  // 3. Obtener lista de citas activas de la clínica
  // Ordenadas por fecha y hora
  const { data: appointments } = await supabase
    .from('appointments')
    .select(`
      id,
      scheduled_at,
      status,
      notes,
      patients (
        id,
        first_name,
        last_name,
        phone,
        id_card
      )
    `)
    .eq('clinic_id', clinicId || '')
    .order('scheduled_at', { ascending: true })

  return (
    <AgendaClient
      patients={patients || []}
      initialAppointments={appointments || []}
    />
  )
}
