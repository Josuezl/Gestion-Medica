import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { isAssistant } from '@/utils/permissions'
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

  // Rol y permisos del usuario (para el borrado de estudios)
  const { data: currentProfile } = await supabase
    .from('user_profiles')
    .select('role, is_org_admin')
    .eq('id', user.id)
    .single()

  // Crear consultas es trabajo médico: los asistentes no tienen acceso.
  if (isAssistant(currentProfile?.role)) {
    redirect('/dashboard')
  }

  // 2. Obtener paciente. Se traen todas las columnas porque el formulario y el
  //    expediente embebido (PatientHistoryTabs) necesitan is_pediatric, birth_date y
  //    gender (campo de perímetro cefálico, pestaña/gráficas de Pediatría) además de
  //    los antecedentes. Con un select mínimo, is_pediatric llegaba undefined y se
  //    ocultaban esas secciones aunque el paciente fuera pediátrico.
  const { data: patient, error } = await supabase
    .from('patients')
    .select('*')
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

  // 4. Cargar estudios médicos y generar URLs firmadas temporales
  const { data: studies } = await supabase
    .from('studies')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  const studiesWithSignedUrls = await Promise.all(
    (studies || []).map(async (study) => {
      let signedUrl = '#'
      try {
        const { data } = await supabase.storage
          .from('medical-studies')
          .createSignedUrl(study.file_url, 900)
        signedUrl = data?.signedUrl || '#'
      } catch {
        // se ignora; el enlace queda como '#'
      }
      return { ...study, signedUrl }
    })
  )

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
      studies={studiesWithSignedUrls}
      prescriptions={prescriptions || []}
      currentUserId={user.id}
      currentUserRole={currentProfile?.role || ''}
      isOrgAdmin={!!currentProfile?.is_org_admin}
    />
  )
}
