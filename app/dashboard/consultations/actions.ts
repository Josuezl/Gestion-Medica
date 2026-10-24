'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/utils/auth-guard'
import { generateVerificationCode } from '@/utils/verification-code'
import { safeErrorMessage } from '@/utils/errors'
import type { Medicine } from '@/utils/medicines'
import { guardarConsulta } from '@/utils/guardado/consulta'

export async function createConsultation(
  patientId: string,
  appointmentId: string | null,
  medicines: Medicine[],
  formData: FormData,
  preclinicalVitalsId: string | null = null
) {
  return guardarConsulta(patientId, appointmentId, medicines, formData, preclinicalVitalsId)
}

/**
 * Emite (o corrige) SOLO la incapacidad médica de una consulta ya guardada, sin tocar ningún otro
 * campo clínico. Pensado para el caso "el médico guardó la consulta y luego el paciente pide una
 * incapacidad". NO es una edición de consulta: el `.update()` escribe únicamente `medical_leave`,
 * así que síntomas/diagnóstico/plan/vitales quedan intactos. La corrección (si ya había incapacidad)
 * queda auditada con old->new por el trigger `on_consultation_modified`.
 */
export async function updateConsultationMedicalLeave(consultationId: string, medicalLeave: string) {
  // Solo roles clínicos (igual que createConsultation).
  const ctx = await requireRole(['ADMIN', 'DOCTOR', 'MEDICO', 'MÉDICO'])
  if (!ctx) return { error: 'No autorizado. Solo los médicos pueden emitir incapacidades.' }

  const text = (medicalLeave || '').trim()
  if (!text) return { error: 'Escribe el texto de la incapacidad.' }

  const supabase = await createClient()

  // Acotar a la clínica del usuario (defensa en profundidad además de RLS) y obtener patient_id
  // para revalidar el expediente correcto.
  const { data: updated, error } = await supabase
    .from('consultations')
    .update({ medical_leave: text })
    .eq('id', consultationId)
    .eq('clinic_id', ctx.clinicId)
    .select('id, patient_id')
    .single()

  if (error) {
    return { error: safeErrorMessage('No se pudo guardar la incapacidad. Inténtalo de nuevo.', 'updateConsultationMedicalLeave', error) }
  }
  if (!updated) {
    return { error: 'No tienes permiso para modificar esta consulta.' }
  }

  revalidatePath(`/dashboard/patients/${updated.patient_id}`)
  return { success: true, consultationId: updated.id }
}

/**
 * Emite una receta NUEVA sobre una consulta ya cerrada (normalmente la última del paciente), sin
 * tocar el resto de la consulta. Caso de uso: el médico cerró la consulta y luego necesita agregar
 * o reemitir una receta. Crea una fila más en `prescriptions` (una consulta puede tener varias).
 * La firma la lleva el médico actual (`doctor_id` = usuario que la emite ahora).
 */
export async function createPrescriptionForConsultation(
  consultationId: string,
  medicines: Medicine[],
  notes: string,
  includeDiagnosis: boolean,
) {
  // Solo roles clínicos (igual que createConsultation / incapacidad).
  const ctx = await requireRole(['ADMIN', 'DOCTOR', 'MEDICO', 'MÉDICO'])
  if (!ctx) return { error: 'No autorizado. Solo los médicos pueden emitir recetas.' }

  const cleanMedicines = (medicines || []).filter((m) => (m?.name ?? '').trim() !== '')
  if (cleanMedicines.length === 0) return { error: 'Agrega al menos un medicamento.' }

  const supabase = await createClient()

  // Validar que la consulta pertenezca a la clínica del usuario (defensa en profundidad además de
  // RLS) y obtener el paciente y el diagnóstico para el snapshot opcional.
  const { data: consult, error: consultErr } = await supabase
    .from('consultations')
    .select('id, patient_id, diagnosis')
    .eq('id', consultationId)
    .eq('clinic_id', ctx.clinicId)
    .single()
  if (consultErr || !consult) {
    return { error: 'No tienes permiso para agregar una receta a esta consulta.' }
  }

  const prescriptionInsert: Record<string, string | Medicine[] | null> = {
    clinic_id: ctx.clinicId,
    patient_id: consult.patient_id,
    consultation_id: consult.id,
    doctor_id: ctx.user.id,
    medicines: cleanMedicines,
    notes: (notes || '').trim(),
    verification_code: generateVerificationCode('MC'),
  }
  const diagnosis = includeDiagnosis ? (consult.diagnosis?.trim() || null) : null
  if (diagnosis) prescriptionInsert.diagnosis = diagnosis

  const { data: prescription, error } = await supabase
    .from('prescriptions')
    .insert([prescriptionInsert])
    .select('id')
    .single()

  if (error || !prescription) {
    return { error: safeErrorMessage('No se pudo guardar la receta. Inténtalo de nuevo.', 'createPrescriptionForConsultation', error) }
  }

  revalidatePath(`/dashboard/patients/${consult.patient_id}`)
  return { success: true, prescriptionId: prescription.id }
}
