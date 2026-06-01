'use server'

import { createClient } from '@/utils/supabase/server'
import { sendMedicalRecordEmail, sendPrescriptionEmail } from '@/utils/email'

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

  const clinicName = profile.clinics?.name || 'Consultorio Médico'
  const doctorName = `Dr. ${profile.first_name} ${profile.last_name}`

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
  await supabase.from('audit_logs').insert([{
    clinic_id: profile.clinic_id,
    performed_by: user.id,
    action: 'SEND_MEDICAL_RECORD_EMAIL',
    record_id: patientId,
    table_name: 'patients'
  }])

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

  // 5. Generar URL firmada temporal del PDF (válida por 24 horas)
  let pdfUrl = '#'
  if (prescription.pdf_url) {
    const { data: signedData } = await supabase.storage
      .from('prescriptions')
      .createSignedUrl(prescription.pdf_url, 86400) // 24 horas

    pdfUrl = signedData?.signedUrl || '#'
  }

  const clinicName = profile.clinics?.name || 'Consultorio Médico'
  const doctorName = `Dr. ${profile.first_name} ${profile.last_name}`
  const patientName = `${patient.first_name} ${patient.last_name}`

  // 6. Enviar correo con Resend
  const result = await sendPrescriptionEmail(
    patient.email,
    patientName,
    doctorName,
    clinicName,
    prescription.verification_code,
    pdfUrl,
    prescription.medicines || [],
    prescription.notes
  )

  if (!result.success) {
    return { error: result.error || 'Error al enviar correo.' }
  }

  // 7. Registrar en bitácora de auditoría
  await supabase.from('audit_logs').insert([{
    clinic_id: profile.clinic_id,
    performed_by: user.id,
    action: 'SEND_PRESCRIPTION_EMAIL',
    record_id: prescriptionId,
    table_name: 'prescriptions'
  }])

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
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id || profile.clinic_id !== prescription.clinic_id) {
    return { error: 'No tienes permiso para editar esta receta.' }
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
  await supabase.from('audit_logs').insert([{
    clinic_id: profile.clinic_id,
    performed_by: user.id,
    action: 'UPDATE_PRESCRIPTION',
    record_id: prescriptionId,
    table_name: 'prescriptions'
  }])

  // Revalidar la página del paciente
  const { revalidatePath } = await import('next/cache')
  revalidatePath(`/dashboard/patients/${prescription.patient_id}`)

  return { success: true }
}
