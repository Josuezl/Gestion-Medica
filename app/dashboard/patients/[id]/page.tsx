import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import PatientDetailsClient from './PatientDetailsClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PatientPage({ params }: PageProps) {
  const resolvedParams = await params
  const patientId = resolvedParams.id
  
  const supabase = await createClient()

  // 1. Validar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

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
  await supabase
    .from('audit_logs')
    .insert([{
      clinic_id: patient.clinic_id,
      performed_by: user.id,
      action: 'READ_PATIENT_EHR',
      record_id: patientId,
      table_name: 'patients'
    }])

  // 3. Cargar consultas de evolución (con recetas asociadas)
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
          .createSignedUrl(study.file_url, 900) // Válido por 15 minutos (900 seg)
        signedUrl = data?.signedUrl || '#'
      } catch (err) {
        console.error('Error generando URL firmada:', err)
      }
      return {
        ...study,
        signedUrl
      }
    })
  )

  // 5. Cargar recetas y generar URLs firmadas para sus PDFs
  const { data: prescriptions } = await supabase
    .from('prescriptions')
    .select('*, user_profiles(first_name, last_name)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  const prescriptionsWithSignedUrls = await Promise.all(
    (prescriptions || []).map(async (presc) => {
      let signedUrl = null
      if (presc.pdf_url) {
        try {
          const { data } = await supabase.storage
            .from('prescriptions')
            .createSignedUrl(presc.pdf_url, 900) // Válido por 15 minutos (900 seg)
          signedUrl = data?.signedUrl
        } catch (err) {
          console.error('Error generando URL firmada para receta:', err)
        }
      }
      return {
        ...presc,
        pdf_url: signedUrl || presc.pdf_url
      }
    })
  )

  return (
    <PatientDetailsClient
      patient={patient}
      consultations={consultations || []}
      studies={studiesWithSignedUrls}
      prescriptions={prescriptionsWithSignedUrls}
    />
  )
}
