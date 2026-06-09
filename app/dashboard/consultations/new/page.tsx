import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import NewConsultationClient from './NewConsultationClient'

interface PageProps {
  searchParams: Promise<{ patientId?: string; appointmentId?: string }>
}

export default async function NewConsultationPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams
  const patientId = resolvedSearchParams.patientId
  const appointmentId = resolvedSearchParams.appointmentId || null

  if (!patientId) {
    redirect('/dashboard/patients')
  }

  const supabase = await createClient()

  // 1. Validar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // 2. Obtener paciente
  const { data: patient, error } = await supabase
    .from('patients')
    .select('id, first_name, last_name')
    .eq('id', patientId)
    .single()

  if (error || !patient) {
    notFound()
  }

  // 3. Cargar consultas de evolución
  const { data: consultations } = await supabase
    .from('consultations')
    .select('*, user_profiles(first_name, last_name), prescriptions(id, medicines, notes, verification_code, pdf_url)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  // 4. Cargar estudios médicos
  const { data: studies } = await supabase
    .from('studies')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  // 5. Cargar recetas
  const { data: prescriptions } = await supabase
    .from('prescriptions')
    .select('*, user_profiles(first_name, last_name)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  return (
    <NewConsultationClient
      patient={patient}
      appointmentId={appointmentId}
      consultations={consultations || []}
      studies={studies || []}
      prescriptions={prescriptions || []}
    />
  )
}
