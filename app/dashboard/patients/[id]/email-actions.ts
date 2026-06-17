'use server'

import { createClient } from '@/utils/supabase/server'
import { sendMedicalRecordEmail, sendPrescriptionEmail } from '@/utils/email'
import { canEditPrescription } from '@/utils/permissions'
import { doctorShortName } from '@/utils/doctorName'
import { formatDateTimeHN } from '@/utils/datetime'

/**
 * Server Action: Enviar ficha médica del paciente por correo electrónico (Resend)
 */
export async function sendMedicalRecordByEmail(patientId: string) {
  const supabase = await createClient()

  // 1. Verificar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  // 2. Obtener datos del doctor y la clínica
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*, clinics(*)')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Error: médico no asociado a clínica' }

  // 3. Obtener datos del paciente
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .single()

  if (patientError || !patient) return { error: 'Paciente no encontrado' }

  if (!patient.email) return { error: 'Este paciente no tiene correo electrónico registrado. Edita su ficha para agregarlo.' }

  const clinicName = profile.practice_name || profile.clinics?.name || 'Consultorio Médico'
  const doctorName = doctorShortName(profile.first_name, profile.last_name, profile.gender)

  // 4. Enviar correo con Resend
  const result = await sendMedicalRecordEmail(
    patient.email,
    {
      firstName: patient.first_name,
      lastName: patient.last_name,
      idCard: patient.id_card,
      birthDate: patient.birth_date,
      gender: patient.gender,
      phone: patient.phone,
      email: patient.email,
      bloodType: patient.blood_type,
      allergies: patient.allergies,
      pathologicalHistory: patient.pathological_history,
      nonPathologicalHistory: patient.non_pathological_history,
      familyHistory: patient.family_history,
    },
    clinicName,
    doctorName
  )

  if (!result.success) {
    return { error: result.error || 'Error al enviar correo.' }
  }

  // 5. Registrar en bitácora de auditoría
  await supabase.rpc('log_audit_event', {
    p_action: 'SEND_MEDICAL_RECORD_EMAIL',
    p_record_id: patientId,
    p_table_name: 'patients'
  })

  return { success: true }
}

/**
 * Server Action: Enviar receta médica por correo electrónico (Resend)
 */
export async function sendPrescriptionByEmail(patientId: string, prescriptionId: string) {
  const supabase = await createClient()

  // 1. Verificar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  // 2. Obtener datos del doctor y clínica
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*, clinics(*)')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Error: médico no asociado a clínica' }

  // 3. Obtener datos del paciente
  const { data: patient } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .single()

  if (!patient) return { error: 'Paciente no encontrado' }
  if (!patient.email) return { error: 'Este paciente no tiene correo electrónico registrado.' }

  // 4. Obtener datos de la receta
  const { data: prescription } = await supabase
    .from('prescriptions')
    .select('*')
    .eq('id', prescriptionId)
    .single()

  if (!prescription) return { error: 'Receta no encontrada' }

  // 5. PDF de la receta: URL firmada (botón) + bytes para adjuntarlo al correo.
  //    El adjunto reutiliza el PDF ya guardado (no gasta almacenamiento extra).
  let pdfUrl = '#'
  let pdfBase64: string | null = null
  if (prescription.pdf_url) {
    const { data: signedData } = await supabase.storage
      .from('prescriptions')
      .createSignedUrl(prescription.pdf_url, 86400) // 24 horas
    pdfUrl = signedData?.signedUrl || '#'

    const { data: pdfBlob } = await supabase.storage
      .from('prescriptions')
      .download(prescription.pdf_url)
    if (pdfBlob) {
      pdfBase64 = Buffer.from(await pdfBlob.arrayBuffer()).toString('base64')
    }
  }

  const clinicName = profile.practice_name || profile.clinics?.name || 'Consultorio Médico'
  const doctorName = doctorShortName(profile.first_name, profile.last_name, profile.gender)
  const patientName = `${patient.first_name} ${patient.last_name}`

  const calculateAge = (birthDateString: string) => {
    const today = new Date()
    const birthDate = new Date(birthDateString)
    let age = today.getFullYear() - birthDate.getFullYear()
    const m = today.getMonth() - birthDate.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
    return age
  }

  const emissionDate = formatDateTimeHN(prescription.created_at)

  // 6. Enviar correo con Resend (mismo formato que la receta impresa)
  const result = await sendPrescriptionEmail({
    toEmail: patient.email,
    clinicName,
    clinicPhone: profile.practice_phone || profile.clinics?.phone,
    clinicAddress: profile.practice_address || profile.clinics?.address,
    doctorName,
    doctorSpecialty: profile.specialty,
    doctorProfessionalId: profile.professional_id,
    patientName,
    patientAge: patient.birth_date ? calculateAge(patient.birth_date) : 0,
    patientGender: patient.gender,
    patientDni: patient.id_card,
    isPediatric: !!patient.is_pediatric,
    date: emissionDate,
    verificationCode: prescription.verification_code,
    pdfUrl,
    pdfBase64,
    medicines: prescription.medicines || [],
    notes: prescription.notes,
  })

  if (!result.success) {
    return { error: result.error || 'Error al enviar correo.' }
  }

  // 7. Registrar en bitácora de auditoría
  await supabase.rpc('log_audit_event', {
    p_action: 'SEND_PRESCRIPTION_EMAIL',
    p_record_id: prescriptionId,
    p_table_name: 'prescriptions'
  })

  return { success: true }
}

/**
 * Server Action: Actualizar medicamentos e indicaciones de una receta existente
 */
export async function updatePrescription(
  prescriptionId: string,
  medicines: { name: string; dose: string; frequency: string; duration: string }[],
  notes: string
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  // Verificar que la receta existe y pertenece a la clínica del doctor
  const { data: prescription } = await supabase
    .from('prescriptions')
    .select('*, patients(id, clinic_id)')
    .eq('id', prescriptionId)
    .single()

  if (!prescription) return { error: 'Receta no encontrada' }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id || profile.clinic_id !== prescription.clinic_id) {
    return { error: 'No tienes permiso para editar esta receta.' }
  }

  // Los asistentes pueden ver/imprimir/enviar recetas, pero no modificarlas.
  if (!canEditPrescription(profile.role)) {
    return { error: 'No tienes permiso para editar recetas.' }
  }

  // Actualizar medicamentos e indicaciones
  const { error } = await supabase
    .from('prescriptions')
    .update({ medicines, notes })
    .eq('id', prescriptionId)

  if (error) {
    return { error: `Error al actualizar receta: ${error.message}` }
  }

  // Registrar en bitácora de auditoría
  await supabase.rpc('log_audit_event', {
    p_action: 'UPDATE_PRESCRIPTION',
    p_record_id: prescriptionId,
    p_table_name: 'prescriptions'
  })

  // Revalidar la página del paciente
  const { revalidatePath } = await import('next/cache')
  revalidatePath(`/dashboard/patients/${prescription.patient_id}`)

  return { success: true }
}
