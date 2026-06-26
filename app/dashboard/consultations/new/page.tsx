import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { canDoClinical } from '@/utils/permissions'
import { getPendingPreclinical } from '@/app/dashboard/preclinical/actions'
import { ensureStudyCatalogSeeded } from '@/utils/ensureStudyCatalog'
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
    .select('role, is_org_admin, clinic_id')
    .eq('id', user.id)
    .single()

  // Crear consultas es trabajo médico: asistente y enfermera no tienen acceso.
  if (!canDoClinical(currentProfile?.role)) {
    redirect('/dashboard')
  }

  // Catálogo de estudios habilitado por defecto: si la clínica aún no lo tiene, se siembra
  // automáticamente (idempotente) para que la "Solicitud de Estudios" funcione sin acción manual.
  if (currentProfile?.clinic_id) {
    await ensureStudyCatalogSeeded(supabase, currentProfile.clinic_id)
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
    .select('*, user_profiles(first_name, last_name, gender), prescriptions(id, medicines, notes, verification_code, pdf_url)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  // 4. Cargar estudios médicos. Las URLs firmadas se generan BAJO DEMANDA al hacer clic (M5).
  const { data: studies } = await supabase
    .from('studies')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  // 5. Cargar recetas
  const { data: prescriptions } = await supabase
    .from('prescriptions')
    .select('*, user_profiles(first_name, last_name, gender)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  // 6. Catálogo de laboratorio activo (agrupado por categoría) para el modal de orden.
  //    RLS aísla por clínica. Se tolera que las tablas aún no existan (migración pendiente).
  const { data: labCats } = await supabase
    .from('lab_test_categories')
    .select('id, name, sort_order')
    .order('sort_order', { ascending: true })
  const { data: labTestRows } = await supabase
    .from('lab_tests')
    .select('category_id, name, sort_order, is_active')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  const labCatalog = (labCats || [])
    .map((c: any) => ({
      category: c.name,
      tests: (labTestRows || []).filter((t: any) => t.category_id === c.id).map((t: any) => t.name),
    }))
    .filter((c: any) => c.tests.length > 0)

  // 7. Órdenes de laboratorio del paciente: historial completo (para la pestaña del expediente)
  //    y la última (para mostrarla como referencia / reusarla en el formulario).
  const { data: labOrders } = await supabase
    .from('lab_orders')
    .select('*, user_profiles!doctor_id(first_name, last_name, gender)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  const lastLabOrder = labOrders && labOrders.length > 0 ? labOrders[0] : null

  // 7.b Catálogo de estudios activo (agrupado por sección) para el modal de solicitud de estudios.
  //      RLS aísla por clínica. Se tolera que las tablas aún no existan (migración pendiente).
  const { data: studySections } = await supabase
    .from('study_sections')
    .select('id, name, sort_order')
    .order('sort_order', { ascending: true })
  const { data: studyCatalogRows } = await supabase
    .from('study_catalog')
    .select('section_id, name, description, patient_indication, sort_order, is_active')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  const studyCatalog = (studySections || [])
    .map((s: any) => ({
      section: s.name,
      studies: (studyCatalogRows || [])
        .filter((r: any) => r.section_id === s.id)
        .map((r: any) => ({ name: r.name, description: r.description, indication: r.patient_indication })),
    }))
    .filter((s: any) => s.studies.length > 0)

  // 7.c Solicitudes de estudios del paciente: historial y la última (para mostrar/reusar como referencia).
  const { data: studyRequests } = await supabase
    .from('study_requests')
    .select('*, user_profiles!doctor_id(first_name, last_name, gender)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  const lastStudyRequest = studyRequests && studyRequests.length > 0 ? studyRequests[0] : null

  // 8. Pre-clínica pendiente de hoy (signos que tomó la enfermera): se precargan en el formulario.
  //    Tolera que la tabla aún no exista (devuelve null) → la pantalla funciona igual que antes.
  const preclinical = await getPendingPreclinical(patientId)

  return (
    <NewConsultationClient
      patient={patient}
      appointmentId={appointmentId}
      preclinical={preclinical}
      consultations={consultations || []}
      studies={studies || []}
      prescriptions={prescriptions || []}
      currentUserId={user.id}
      currentUserRole={currentProfile?.role || ''}
      isOrgAdmin={!!currentProfile?.is_org_admin}
      labCatalog={labCatalog}
      lastLabOrder={lastLabOrder || null}
      labOrders={labOrders || []}
      studyCatalog={studyCatalog}
      lastStudyRequest={lastStudyRequest || null}
      studyRequests={studyRequests || []}
    />
  )
}
