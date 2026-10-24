// Lógica de servidor (sin 'use server'): la llaman la Server Action y la ruta /api/guardar/*.
// Movida sin cambios desde app/dashboard/actions.ts (Task 3B): una ruta de API
// mantiene su dirección entre despliegues; una pestaña abierta desde antes puede seguir guardando.

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { isValidAppointmentStatus, isCreatableAppointmentStatus } from '@/utils/validation'
import { safeErrorMessage } from '@/utils/errors'

/**
 * ¿La clínica tiene clínicas (locations) activas? Si las tiene, la cita debe asignarse a
 * una; de lo contrario quedaría "huérfana" y no aparecería al filtrar la agenda por clínica.
 */
export async function clinicHasActiveLocations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from('locations')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('is_active', true)
  return (count ?? 0) > 0
}

/**
 * ¿La cita tiene al menos una consulta registrada? Se usa para impedir marcarla como "Realizada"
 * (COMPLETED) sin consulta. Acotado a la clínica (defensa en profundidad además de RLS).
 */
export async function appointmentHasConsultation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  appointmentId: string,
  clinicId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from('consultations')
    .select('id', { count: 'exact', head: true })
    .eq('appointment_id', appointmentId)
    .eq('clinic_id', clinicId)
  return (count ?? 0) > 0
}

export async function crearCita(formData: FormData) {
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
  const locationId = formData.get('location_id') as string || null
  const notes = formData.get('notes') as string || null
  const durationStr = formData.get('duration_minutes') as string
  const duration = durationStr ? parseInt(durationStr, 10) : 15
  const status = formData.get('status') as string || 'PENDING'

  if (!patientId) {
    return { error: 'Debes seleccionar un paciente registrado para la cita.' }
  }

  if (!dateStr || !timeStr) {
    return { error: 'Por favor selecciona fecha y hora para la cita.' }
  }

  // Validar estado y duración (M2).
  if (!isValidAppointmentStatus(status)) return { error: 'Estado de cita no válido.' }
  // Al crear, solo se permiten estados previos o en curso (no "Realizada"/"No se presentó"/"Cancelada":
  // describen algo posterior; "Realizada" además requeriría una consulta que la cita nueva no tiene).
  if (!isCreatableAppointmentStatus(status)) {
    return { error: 'Una cita nueva solo puede crearse como Pendiente, Confirmada, En sala de espera o En consulta.' }
  }
  if (!Number.isFinite(duration) || duration < 5 || duration > 480) {
    return { error: 'La duración de la cita debe estar entre 5 y 480 minutos.' }
  }

  if (!locationId && await clinicHasActiveLocations(supabase, profile.clinic_id)) {
    return { error: 'Selecciona una clínica para la cita.' }
  }

  // Combinar fecha y hora en formato ISO string
  // Indicamos explícitamente que la hora ingresada es de Honduras (UTC-6)
  const scheduledAt = new Date(`${dateStr}T${timeStr}:00-06:00`).toISOString()

  const appointmentData = {
    clinic_id: profile.clinic_id,
    patient_id: patientId,
    doctor_id: doctorId,
    scheduled_at: scheduledAt,
    status: status,
    duration_minutes: duration,
    location_id: locationId,
    notes
  }

  const { error } = await supabase
    .from('appointments')
    .insert([appointmentData])

  if (error) {
    return { error: safeErrorMessage('No se pudo crear la cita. Inténtalo de nuevo.', 'createAppointment', error) }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function actualizarCita(id: string, formData: FormData) {
  const supabase = await createClient()

  // Sesión + clínica (defensa en profundidad, igual que las demás mutaciones).
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { data: authProfile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!authProfile?.clinic_id) return { error: 'No autorizado' }

  const patientId = formData.get('patient_id') as string || null
  const doctorId = formData.get('doctor_id') as string
  const dateStr = formData.get('date') as string
  const timeStr = formData.get('time') as string
  const locationId = formData.get('location_id') as string || null
  const notes = formData.get('notes') as string || null
  const durationStr = formData.get('duration_minutes') as string
  const duration = durationStr ? parseInt(durationStr, 10) : 15
  const status = formData.get('status') as string || 'PENDING'

  if (!dateStr || !timeStr || !doctorId) {
    return { error: 'Datos incompletos para actualizar.' }
  }

  if (!patientId) {
    return { error: 'Debes seleccionar un paciente registrado para la cita.' }
  }

  // Validar estado y duración (M2).
  if (!isValidAppointmentStatus(status)) return { error: 'Estado de cita no válido.' }
  if (!Number.isFinite(duration) || duration < 5 || duration > 480) {
    return { error: 'La duración de la cita debe estar entre 5 y 480 minutos.' }
  }

  // No permitir "Realizada" si la cita no tiene una consulta registrada (defensa en profundidad;
  // la UI lo bloquea con un modal en el dropdown de la agenda).
  if (status === 'COMPLETED' && !(await appointmentHasConsultation(supabase, id, authProfile.clinic_id))) {
    return { error: 'No se puede marcar como "Realizada": esta cita no tiene una consulta registrada. Inicia la consulta o elige otro estado.' }
  }

  const { data: current } = await supabase
    .from('appointments')
    .select('status')
    .eq('id', id)
    .eq('clinic_id', authProfile.clinic_id)
    .single()
  if (!current) return { error: 'No tienes permiso para modificar esta cita.' }

  // Solicitudes del portal público: aprobar/rechazar se hace en "Solicitudes" (crea la ficha del
  // paciente o la asigna). Desde la agenda solo se permite editar sin cambiar el estado, o cancelar
  // (el trigger de BD rechaza la solicitud). Nadie puede poner una cita normal en PENDING_REVIEW.
  if (current.status === 'PENDING_REVIEW' && status !== 'PENDING_REVIEW' && status !== 'CANCELLED') {
    return { error: 'Esta cita es una solicitud del portal público: apruébala o recházala desde "Solicitudes".' }
  }
  if (current.status !== 'PENDING_REVIEW' && status === 'PENDING_REVIEW') {
    return { error: 'El estado "Por aprobar" es exclusivo de las solicitudes del portal público.' }
  }

  if (!locationId && await clinicHasActiveLocations(supabase, authProfile.clinic_id)) {
    return { error: 'Selecciona una clínica para la cita.' }
  }

  const scheduledAt = new Date(`${dateStr}T${timeStr}:00-06:00`).toISOString()

  const { data: updated, error } = await supabase
    .from('appointments')
    .update({
      patient_id: patientId,
      doctor_id: doctorId,
      scheduled_at: scheduledAt,
      duration_minutes: duration,
      location_id: locationId,
      notes,
      status
    })
    .eq('id', id)
    .eq('clinic_id', authProfile.clinic_id)
    .select('id')

  if (error) {
    return { error: safeErrorMessage('No se pudo actualizar la cita. Inténtalo de nuevo.', 'updateAppointment', error) }
  }
  if (!updated || updated.length === 0) {
    return { error: 'No tienes permiso para modificar esta cita.' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard')
  return { success: true }
}
