'use server'

import { createClient } from '@/utils/supabase/server'
import { sendMedicalRecordEmail, sendPrescriptionEmail, sendDocumentLinkEmail } from '@/utils/email'
import { generatePrescriptionPDF } from '@/utils/pdf-generator'
import { safeErrorMessage } from '@/utils/errors'
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

  // 5. PDF de la receta: se GENERA AL VUELO solo para este envío (no se almacena → no gasta cuota).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  let pdfBase64: string | null = null
  try {
    const pdfBuffer = await generatePrescriptionPDF({
      clinicName,
      clinicPhone: profile.practice_phone || profile.clinics?.phone || 'N/A',
      clinicAddress: profile.practice_address || profile.clinics?.address || 'Honduras',
      doctorName,
      doctorSpecialty: profile.specialty || 'Medicina General',
      doctorProfessionalId: profile.professional_id || 'N/A',
      patientName,
      patientAge: patient.birth_date ? calculateAge(patient.birth_date) : 0,
      patientDni: patient.id_card || 'N/A',
      date: emissionDate,
      medicines: prescription.medicines || [],
      notes: prescription.notes,
      diagnosis: prescription.diagnosis || undefined,
      verificationCode: prescription.verification_code,
      siteUrl,
      doctorSignatureUrl: profile.signature_url || undefined,
    })
    pdfBase64 = Buffer.from(pdfBuffer).toString('base64')
  } catch (e) {
    console.error('No se pudo generar el PDF de la receta para el correo:', e)
  }
  // El botón "Descargar/Ver receta" apunta a la vista pública (HTML), sin depender de Storage.
  const pdfUrl = prescription.verification_code
    ? `${siteUrl}/prescriptions/view/${prescriptionId}?code=${prescription.verification_code}`
    : '#'

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
    signatureUrl: profile.signature_url || null,
    diagnosis: prescription.diagnosis || null,
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
 * Server Action: Enviar una orden de laboratorio por correo (enlace verificable, sin PDF).
 */
export async function sendLabOrderByEmail(patientId: string, labOrderId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*, clinics(*)')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Error: usuario no asociado a clínica' }

  const { data: patient } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .single()
  if (!patient) return { error: 'Paciente no encontrado' }
  if (!patient.email) return { error: 'Este paciente no tiene correo electrónico registrado.' }

  const { data: order } = await supabase
    .from('lab_orders')
    .select('*, user_profiles!doctor_id(first_name, last_name, gender)')
    .eq('id', labOrderId)
    .single()
  if (!order) return { error: 'Orden de laboratorio no encontrada' }
  if (order.clinic_id !== profile.clinic_id) return { error: 'No autorizado' }
  if (!order.verification_code) return { error: 'La orden no tiene código de verificación.' }

  const clinicName = profile.practice_name || profile.clinics?.name || 'Consultorio Médico'
  const od: any = order.user_profiles
  const doctorName = od
    ? doctorShortName(od.first_name, od.last_name, od.gender)
    : doctorShortName(profile.first_name, profile.last_name, profile.gender)

  // Resumen legible de los exámenes solicitados.
  const tests = Array.isArray(order.tests) ? order.tests : []
  const testNames = tests.map((t: any) => t?.name).filter(Boolean)
  const otherLines = (order.other_tests || '').split('\n').map((s: string) => s.trim()).filter(Boolean)
  const examenes = [...testNames, ...otherLines].join(' · ')

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  const result = await sendDocumentLinkEmail({
    toEmail: patient.email,
    subject: `Orden de Laboratorio - ${order.verification_code} | ${clinicName}`,
    docTitle: 'Orden de Laboratorio',
    clinicName,
    clinicPhone: profile.practice_phone || profile.clinics?.phone,
    clinicAddress: profile.practice_address || profile.clinics?.address,
    doctorName,
    doctorSpecialty: profile.specialty,
    patientName: `${patient.first_name} ${patient.last_name}`,
    date: formatDateTimeHN(order.created_at),
    verificationCode: order.verification_code,
    verifyUrl: `${siteUrl}/verificar/${order.verification_code}`,
    summary: [{ label: 'Exámenes solicitados', value: examenes }],
  })

  if (!result.success) return { error: result.error || 'Error al enviar correo.' }

  await supabase.rpc('log_audit_event', {
    p_action: 'SEND_LAB_ORDER_EMAIL',
    p_record_id: labOrderId,
    p_table_name: 'lab_orders'
  })

  return { success: true }
}

/**
 * Server Action: Enviar una incapacidad médica por correo (enlace verificable, sin PDF).
 */
export async function sendIncapacidadByEmail(patientId: string, consultationId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*, clinics(*)')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Error: usuario no asociado a clínica' }

  const { data: patient } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .single()
  if (!patient) return { error: 'Paciente no encontrado' }
  if (!patient.email) return { error: 'Este paciente no tiene correo electrónico registrado.' }

  const { data: consultation } = await supabase
    .from('consultations')
    .select('*, user_profiles(first_name, last_name, gender)')
    .eq('id', consultationId)
    .single()
  if (!consultation) return { error: 'Consulta no encontrada' }
  if (consultation.clinic_id !== profile.clinic_id) return { error: 'No autorizado' }
  if (!consultation.medical_leave || String(consultation.medical_leave).trim() === '') {
    return { error: 'Esta consulta no tiene una incapacidad registrada.' }
  }
  if (!consultation.verification_code) return { error: 'La incapacidad no tiene código de verificación.' }

  const clinicName = profile.practice_name || profile.clinics?.name || 'Consultorio Médico'
  const cd: any = consultation.user_profiles
  const doctorName = cd
    ? doctorShortName(cd.first_name, cd.last_name, cd.gender)
    : doctorShortName(profile.first_name, profile.last_name, profile.gender)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  const result = await sendDocumentLinkEmail({
    toEmail: patient.email,
    subject: `Incapacidad Médica - ${consultation.verification_code} | ${clinicName}`,
    docTitle: 'Incapacidad Médica',
    clinicName,
    clinicPhone: profile.practice_phone || profile.clinics?.phone,
    clinicAddress: profile.practice_address || profile.clinics?.address,
    doctorName,
    doctorSpecialty: profile.specialty,
    patientName: `${patient.first_name} ${patient.last_name}`,
    date: formatDateTimeHN(consultation.created_at),
    verificationCode: consultation.verification_code,
    verifyUrl: `${siteUrl}/verificar/${consultation.verification_code}`,
    summary: [{ label: 'Incapacidad médica', value: consultation.medical_leave }],
  })

  if (!result.success) return { error: result.error || 'Error al enviar correo.' }

  await supabase.rpc('log_audit_event', {
    p_action: 'SEND_INCAPACIDAD_EMAIL',
    p_record_id: consultationId,
    p_table_name: 'consultations'
  })

  return { success: true }
}

/**
 * Server Action: Enviar una referencia médica por correo (enlace verificable, sin PDF).
 * El documento muestra Motivo de consulta + Motivo de referencia.
 */
export async function sendReferralByEmail(patientId: string, consultationId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*, clinics(*)')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Error: usuario no asociado a clínica' }

  const { data: patient } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .single()
  if (!patient) return { error: 'Paciente no encontrado' }
  if (!patient.email) return { error: 'Este paciente no tiene correo electrónico registrado.' }

  const { data: consultation } = await supabase
    .from('consultations')
    .select('*, user_profiles(first_name, last_name, gender)')
    .eq('id', consultationId)
    .single()
  if (!consultation) return { error: 'Consulta no encontrada' }
  if (consultation.clinic_id !== profile.clinic_id) return { error: 'No autorizado' }
  if (!consultation.referral || String(consultation.referral).trim() === '') {
    return { error: 'Esta consulta no tiene una referencia registrada.' }
  }
  if (!consultation.verification_code) return { error: 'La referencia no tiene código de verificación.' }

  const clinicName = profile.practice_name || profile.clinics?.name || 'Consultorio Médico'
  const cd: any = consultation.user_profiles
  const doctorName = cd
    ? doctorShortName(cd.first_name, cd.last_name, cd.gender)
    : doctorShortName(profile.first_name, profile.last_name, profile.gender)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  const summary: { label: string; value: string }[] = []
  if (consultation.reason_for_visit) summary.push({ label: 'Motivo de consulta', value: consultation.reason_for_visit })
  summary.push({ label: 'Motivo de referencia', value: consultation.referral })

  const result = await sendDocumentLinkEmail({
    toEmail: patient.email,
    subject: `Referencia Médica - ${consultation.verification_code} | ${clinicName}`,
    docTitle: 'Referencia Médica',
    clinicName,
    clinicPhone: profile.practice_phone || profile.clinics?.phone,
    clinicAddress: profile.practice_address || profile.clinics?.address,
    doctorName,
    doctorSpecialty: profile.specialty,
    patientName: `${patient.first_name} ${patient.last_name}`,
    date: formatDateTimeHN(consultation.created_at),
    verificationCode: consultation.verification_code,
    verifyUrl: `${siteUrl}/verificar/${consultation.verification_code}?doc=referral`,
    summary,
  })

  if (!result.success) return { error: result.error || 'Error al enviar correo.' }

  await supabase.rpc('log_audit_event', {
    p_action: 'SEND_REFERRAL_EMAIL',
    p_record_id: consultationId,
    p_table_name: 'consultations'
  })

  return { success: true }
}
