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

  return (
    <NewConsultationClient
      patient={patient}
      appointmentId={appointmentId}
    />
  )
}
