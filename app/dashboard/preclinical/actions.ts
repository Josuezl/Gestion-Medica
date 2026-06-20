'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/utils/auth-guard'
import { validateVitals } from '@/utils/validation'
import { safeErrorMessage } from '@/utils/errors'

// Inicio del día local de Honduras (UTC-6, sin horario de verano) expresado en UTC.
// Sirve para acotar "la pre-clínica de hoy".
function startOfTodayHondurasUTC(): string {
  const HN_OFFSET_MIN = 6 * 60
  const hnNow = new Date(Date.now() - HN_OFFSET_MIN * 60000)
  const y = hnNow.getUTCFullYear()
  const m = hnNow.getUTCMonth()
  const d = hnNow.getUTCDate()
  // Medianoche HN = 06:00 UTC del mismo día.
  return new Date(Date.UTC(y, m, d, HN_OFFSET_MIN / 60, 0, 0)).toISOString()
}

/**
 * Guarda los signos vitales de pre-clínica del paciente (enfermera o médico).
 * Idempotente por día: si ya hay una pre-clínica pendiente de hoy, la actualiza (no duplica).
 * No crea consultas; solo deja los signos listos para que el médico los cargue en "Nueva consulta".
 */
export async function savePreclinicalVitals(
  patientId: string,
  appointmentId: string | null,
  formData: FormData
) {
  const ctx = await requireRole(['ADMIN', 'DOCTOR', 'MEDICO', 'MÉDICO', 'NURSE'])
  if (!ctx) return { error: 'No autorizado para registrar signos vitales.' }

  const supabase = await createClient()

  const bp = (formData.get('blood_pressure') as string) || null
  const tempVal = formData.get('temperature') as string
  const weightVal = formData.get('weight') as string
  const heightVal = formData.get('height') as string
  const headCircVal = formData.get('head_circumference') as string
  const hrVal = formData.get('heart_rate') as string
  const rrVal = formData.get('respiratory_rate') as string
  const oxVal = formData.get('oxygen_saturation') as string
  const notes = (formData.get('notes') as string) || null

  const temperature = tempVal ? parseFloat(tempVal) : null
  const weight = weightVal ? parseFloat(weightVal) : null
  const height = heightVal ? parseFloat(heightVal) : null
  const headCircumference = headCircVal ? parseFloat(headCircVal) : null
  const heartRate = hrVal ? parseInt(hrVal, 10) : null
  const respiratoryRate = rrVal ? parseInt(rrVal, 10) : null
  const oxygenSaturation = oxVal ? parseInt(oxVal, 10) : null

  const vitalError = validateVitals({ temperature, weight, height, headCircumference, heartRate, respiratoryRate, oxygenSaturation })
  if (vitalError) return { error: vitalError }

  const row = {
    blood_pressure: bp,
    temperature,
    weight,
    height,
    head_circumference: headCircumference,
    heart_rate: heartRate,
    respiratory_rate: respiratoryRate,
    oxygen_saturation: oxygenSaturation,
    notes,
  }

  // ¿Ya hay una pre-clínica pendiente de hoy para este paciente? → se actualiza.
  const { data: existing } = await supabase
    .from('preclinical_vitals')
    .select('id')
    .eq('patient_id', patientId)
    .is('consumed_at', null)
    .gte('created_at', startOfTodayHondurasUTC())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await supabase
      .from('preclinical_vitals')
      .update({ ...row, appointment_id: appointmentId, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) return { error: safeErrorMessage('No se pudieron actualizar los signos vitales.', 'savePreclinicalVitals.update', error) }
  } else {
    const { error } = await supabase
      .from('preclinical_vitals')
      .insert([{
        ...row,
        clinic_id: ctx.clinicId,
        patient_id: patientId,
        appointment_id: appointmentId,
        recorded_by: ctx.user.id,
      }])
    if (error) return { error: safeErrorMessage('No se pudieron guardar los signos vitales.', 'savePreclinicalVitals.insert', error) }
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/patients/${patientId}`)
  return { success: true }
}

/**
 * La pre-clínica pendiente (sin consulta) más reciente del paciente registrada hoy, o null.
 * Tolera que la tabla aún no exista (migración pendiente) devolviendo null.
 */
export async function getPendingPreclinical(patientId: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('preclinical_vitals')
      .select('*, recorded_by_profile:user_profiles!recorded_by(first_name, last_name)')
      .eq('patient_id', patientId)
      .is('consumed_at', null)
      .gte('created_at', startOfTodayHondurasUTC())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return null
    return data
  } catch {
    return null
  }
}

/**
 * IDs de pacientes con pre-clínica pendiente de hoy (para marcar las citas en la agenda).
 * Tolera que la tabla aún no exista devolviendo un set vacío.
 */
export async function getPendingPreclinicalPatientIds(): Promise<string[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('preclinical_vitals')
      .select('patient_id')
      .is('consumed_at', null)
      .gte('created_at', startOfTodayHondurasUTC())
    if (error || !data) return []
    return Array.from(new Set(data.map((r: any) => r.patient_id)))
  } catch {
    return []
  }
}
