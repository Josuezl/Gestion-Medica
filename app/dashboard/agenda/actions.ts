'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createAppointment(formData: FormData) {
  const supabase = await createClient()

  // 1. Validar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Error: clínica no asociada.' }

  const patientId = formData.get('patient_id') as string || null
  const doctorId = formData.get('doctor_id') as string || user.id // Asistente puede enviar doctor_id
  const dateStr = formData.get('date') as string // YYYY-MM-DD
  const timeStr = formData.get('time') as string // HH:MM
  const notes = formData.get('notes') as string || null
  const durationStr = formData.get('duration_minutes') as string
  const duration = durationStr ? parseInt(durationStr, 10) : 15

  if (!dateStr || !timeStr) {
    return { error: 'Por favor selecciona fecha y hora para la cita.' }
  }

  // Combinar fecha y hora en formato ISO string
  // Indicamos explícitamente que la hora ingresada es de Honduras (UTC-6)
  const scheduledAt = new Date(`${dateStr}T${timeStr}:00-06:00`).toISOString()

  const appointmentData = {
    clinic_id: profile.clinic_id,
    patient_id: patientId,
    doctor_id: doctorId,
    scheduled_at: scheduledAt,
    status: 'PENDING', // Nuevo estado por defecto PENDING (antes CONFIRMED)
    duration_minutes: duration,
    notes
  }

  const { error } = await supabase
    .from('appointments')
    .insert([appointmentData])

  if (error) {
    return { error: `Error al crear la cita: ${error.message}` }
  }

  revalidatePath('/dashboard/agenda')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateAppointment(id: string, formData: FormData) {
  const supabase = await createClient()

  const doctorId = formData.get('doctor_id') as string
  const dateStr = formData.get('date') as string
  const timeStr = formData.get('time') as string
  const notes = formData.get('notes') as string || null
  const durationStr = formData.get('duration_minutes') as string
  const duration = durationStr ? parseInt(durationStr, 10) : 15

  if (!dateStr || !timeStr || !doctorId) {
    return { error: 'Datos incompletos para actualizar.' }
  }

  const scheduledAt = new Date(`${dateStr}T${timeStr}:00-06:00`).toISOString()

  const { error } = await supabase
    .from('appointments')
    .update({
      doctor_id: doctorId,
      scheduled_at: scheduledAt,
      duration_minutes: duration,
      notes
    })
    .eq('id', id)

  if (error) {
    return { error: `Error al actualizar la cita: ${error.message}` }
  }

  revalidatePath('/dashboard/agenda')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateAppointmentStatus(appointmentId: string, status: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', appointmentId)

  if (error) {
    return { error: `Error al actualizar estado: ${error.message}` }
  }

  revalidatePath('/dashboard/agenda')
  revalidatePath('/dashboard')
  return { success: true }
}
