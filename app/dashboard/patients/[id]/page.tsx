import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { getSessionProfile } from '@/utils/session'
import type { OdontogramaGuardado } from '../../odontologia/OdontogramaTab'
import { validarEstado, type Denticion } from '@/utils/odontograma'
import { notFound } from 'next/navigation'
import { canDoClinical } from '@/utils/permissions'
import PatientDetailsClient from './PatientDetailsClient'
import type { ConsultationRow, MedicalLeaveRow, ReferralRow, StudyRow } from '@/utils/clinicalTypes'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function PatientPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params
  const patientId = resolvedParams.id
  
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const isEditing = resolvedSearchParams.edit === 'true'
  const justCreated = resolvedSearchParams.creado === '1'
  
  const supabase = await createClient()

  // 1. Validar autenticación
  const session = await getSessionProfile()
  if (!session?.profile) return null
  const { user, profile } = session
  const odontologiaHabilitada = profile.odontologia_habilitada
  const isDentist = odontologiaHabilitada && profile.is_dentist

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

  // Asistente y enfermera solo gestionan datos del paciente y recetas: no cargamos
  // datos clínicos (consultas/estudios) para no enviarlos al cliente.
  const clinical = canDoClinical(profile.role)

  // 3. Cargar consultas de evolución (con recetas asociadas)
  const { data: consultations } = !clinical
    ? { data: [] as ConsultationRow[] }
    : await supabase
        .from('consultations')
        .select('*, user_profiles(first_name, last_name, gender), prescriptions(id, medicines, notes, verification_code, pdf_url)')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })

  // 4. Cargar estudios médicos. Las URLs firmadas se generan BAJO DEMANDA (al hacer clic en
  //    "Ver/Descargar"), no aquí, para evitar el N+1 a Storage por carga de página (M5).
  const { data: studies } = !clinical
    ? { data: [] as StudyRow[] }
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

  // 6.b Cargar solicitudes de estudios del paciente (para la pestaña "Estudios").
  const { data: studyRequests } = await supabase
    .from('study_requests')
    .select('*, user_profiles!doctor_id(first_name, last_name, gender)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  // 7. Cargar incapacidades médicas (consultas con `medical_leave`). Se traen para TODOS los roles
  //    —incl. asistente/enfermería, que pueden imprimirlas/enviarlas— pero SOLO columnas no sensibles
  //    (sin diagnóstico/plan), para no exponer datos clínicos en la lista del expediente.
  const { data: medicalLeaves } = await supabase
    .from('consultations')
    .select('id, created_at, verification_code, medical_leave, leave_start_date, leave_days, user_profiles(first_name, last_name, gender)')
    .eq('patient_id', patientId)
    .not('medical_leave', 'is', null)
    .neq('medical_leave', '')
    .order('created_at', { ascending: false })

  // 8. Cargar referencias médicas (consultas con `referral`). Misma lógica que incapacidades:
  //    para todos los roles, solo columnas no sensibles.
  const { data: referrals } = await supabase
    .from('consultations')
    .select('id, created_at, verification_code, referral, referral_to, user_profiles(first_name, last_name, gender)')
    .eq('patient_id', patientId)
    .not('referral', 'is', null)
    .neq('referral', '')
    .order('created_at', { ascending: false })

  const odontogramas = odontologiaHabilitada ? await cargarOdontogramas(supabase, patientId) : null

  return (
    <PatientDetailsClient
      patient={patient}
      consultations={consultations || []}
      studies={studies || []}
      prescriptions={prescriptions || []}
      labOrders={labOrders || []}
      studyRequests={studyRequests || []}
      medicalLeaves={(medicalLeaves as unknown as MedicalLeaveRow[]) || []}
      referrals={(referrals as unknown as ReferralRow[]) || []}
      showRecordNumber={profile.show_record_number}
      initialEdit={isEditing}
      justCreated={justCreated}
      currentUserId={user.id}
      currentUserRole={profile.role ?? ''}
      isOrgAdmin={!!profile.is_org_admin}
      odontologiaHabilitada={odontologiaHabilitada}
      odontogramas={odontogramas}
      isDentist={isDentist}
    />
  )
}

async function cargarOdontogramas(supabase: Awaited<ReturnType<typeof createClient>>, patientId: string) {
  const consulta = supabase.from('odontogramas').select('id, consultation_id, created_at, denticion, estado')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  const historial: OdontogramaGuardado[] = []
  const lote = 500

  for (let inicio = 0; ; inicio += lote) {
    const { data, error } = await consulta.range(inicio, inicio + lote - 1)
    if (error) return null

    for (const fila of data) {
      const resultado = validarEstado(fila.estado)
      historial.push({
        id: fila.id,
        consultaId: fila.consultation_id,
        fecha: fila.created_at,
        denticion: fila.denticion as Denticion,
        estado: resultado.ok ? resultado.estado : null,
      })
    }
    if (data.length < lote) return historial
  }
}
