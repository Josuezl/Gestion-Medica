import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import { isAssistant } from '@/utils/permissions'
import PatientDetailsClient from './PatientDetailsClient'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function PatientPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params
  const patientId = resolvedParams.id
  
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const isEditing = resolvedSearchParams.edit === 'true'
  
  const supabase = await createClient()

  // 1. Validar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Rol y permisos del usuario actual (para controlar el borrado de estudios)
  const { data: currentProfile } = await supabase
    .from('user_profiles')
    .select('role, is_org_admin')
    .eq('id', user.id)
    .single()

  // 2. Cargar expediente del paciente
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .single()

  if (patientError || !patient) {
    notFound()
  }

  // Registrar acceso de lectura al expediente en la bitácora de auditoría
  await supabase.rpc('log_audit_event', {
    p_action: 'READ_PATIENT_EHR',
    p_record_id: patientId,
    p_table_name: 'patients'
  })

  // Los asistentes solo gestionan datos del paciente y recetas: no cargamos
  // datos clínicos (consultas/estudios) para no enviarlos al cliente.
  const assistant = isAssistant(currentProfile?.role)

  // 3. Cargar consultas de evolución (con recetas asociadas)
  const { data: consultations } = assistant
    ? { data: [] as any[] }
    : await supabase
        .from('consultations')
        .select('*, user_profiles(first_name, last_name, gender), prescriptions(id, medicines, notes, verification_code, pdf_url)')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })

  // 4. Cargar estudios médicos. Las URLs firmadas se generan BAJO DEMANDA (al hacer clic en
  //    "Ver/Descargar"), no aquí, para evitar el N+1 a Storage por carga de página (M5).
  const { data: studies } = assistant
    ? { data: [] as any[] }
    : await supabase
        .from('studies')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })

  // 5. Cargar recetas y generar URLs firmadas para sus PDFs
  const { data: prescriptions } = await supabase
    .from('prescriptions')
    .select('*, user_profiles(first_name, last_name, gender)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  // Nota: ya no se firman URLs del PDF almacenado de cada receta. La UI no usa `pdf_url`
  // (imprime HTML, y el correo genera el PDF al vuelo), así que ese trabajo era inútil y además
  // era el patrón N+1 a Storage por carga de página (hallazgo M5). Las recetas se pasan tal cual.

  // 6. Cargar órdenes de laboratorio del paciente (para la pestaña "Lab. Solicitados").
  const { data: labOrders } = await supabase
    .from('lab_orders')
    .select('*, user_profiles!doctor_id(first_name, last_name, gender)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  return (
    <PatientDetailsClient
      patient={patient}
      consultations={consultations || []}
      studies={studies || []}
      prescriptions={prescriptions || []}
      labOrders={labOrders || []}
      initialEdit={isEditing}
      currentUserId={user.id}
      currentUserRole={currentProfile?.role || ''}
      isOrgAdmin={!!currentProfile?.is_org_admin}
    />
  )
}
