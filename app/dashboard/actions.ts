'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { isValidAppointmentStatus, isCreatableAppointmentStatus } from '@/utils/validation'
import { safeErrorMessage } from '@/utils/errors'
import { generateBookingToken } from '@/utils/verification-code'

/**
 * ¿La clínica tiene clínicas (locations) activas? Si las tiene, la cita debe asignarse a
 * una; de lo contrario quedaría "huérfana" y no aparecería al filtrar la agenda por clínica.
 */
async function clinicHasActiveLocations(
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
async function appointmentHasConsultation(
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

export async function updateAppointment(id: string, formData: FormData) {
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

export async function updateAppointmentStatus(appointmentId: string, status: string) {
  const supabase = await createClient()

  // Validar el estado contra el enum permitido (utils/validation.ts, testeable).
  if (!isValidAppointmentStatus(status)) {
    return { error: 'Estado de cita no válido.' }
  }

  // Defensa en profundidad (A4): sesión + acotar el UPDATE a la clínica del usuario.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { data: authProfile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!authProfile?.clinic_id) return { error: 'No autorizado' }

  // No permitir "Realizada" si la cita no tiene una consulta registrada. No actualiza y devuelve un
  // sentinel para que la agenda muestre el modal (iniciar consulta o cambiar a otro estado).
  if (status === 'COMPLETED' && !(await appointmentHasConsultation(supabase, appointmentId, authProfile.clinic_id))) {
    return { needsConsultation: true }
  }

  // Solicitudes del portal público: solo se pueden cancelar desde la agenda (el trigger de BD
  // rechaza la solicitud); aprobar se hace en "Solicitudes". Y ninguna cita puede ponerse en
  // PENDING_REVIEW a mano: ese estado lo crea únicamente el portal.
  if (status === 'PENDING_REVIEW') {
    return { error: 'El estado "Por aprobar" es exclusivo de las solicitudes del portal público.' }
  }
  const { data: current } = await supabase
    .from('appointments')
    .select('status')
    .eq('id', appointmentId)
    .eq('clinic_id', authProfile.clinic_id)
    .single()
  if (!current) return { error: 'No tienes permiso para modificar esta cita.' }
  if (current.status === 'PENDING_REVIEW' && status !== 'CANCELLED') {
    return { error: 'Esta cita es una solicitud del portal público: apruébala o recházala desde "Solicitudes".' }
  }

  const { data: updated, error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', appointmentId)
    .eq('clinic_id', authProfile.clinic_id)
    .select('id')

  if (error) {
    return { error: safeErrorMessage('No se pudo actualizar el estado de la cita.', 'updateAppointmentStatus', error) }
  }
  if (!updated || updated.length === 0) {
    return { error: 'No tienes permiso para modificar esta cita.' }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

/**
 * Elimina (borra) una cita por completo. A diferencia de cancelar (que la deja como CANCELLED y sigue
 * contando en reportes), esto la quita del dashboard Y de los reportes. Acotado a la clínica del usuario.
 */
export async function deleteAppointment(appointmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { data: authProfile } = await supabase
    .from('user_profiles').select('clinic_id').eq('id', user.id).single()
  if (!authProfile?.clinic_id) return { error: 'No autorizado' }

  // Desvincular signos pre-clínicos que apunten a esta cita (evita romper la FK al borrar).
  await supabase.from('preclinical_vitals').update({ appointment_id: null })
    .eq('appointment_id', appointmentId).eq('clinic_id', authProfile.clinic_id)

  const { data: deleted, error } = await supabase
    .from('appointments').delete().eq('id', appointmentId).eq('clinic_id', authProfile.clinic_id).select('id')
  if (error) return { error: safeErrorMessage('No se pudo eliminar la cita.', 'deleteAppointment', error) }
  if (!deleted || deleted.length === 0) return { error: 'No tienes permiso para eliminar esta cita.' }

  revalidatePath('/dashboard')
  return { success: true }
}

/**
 * Devuelve TODAS las citas de un paciente (pasadas y futuras), de cualquier médico y cualquier
 * clínica, para el buscador de historial del dashboard. No filtra por `doctor_id`, `location_id`
 * ni fecha; sí acota a la clínica del usuario (RLS + filtro explícito, defensa en profundidad).
 * Usa el mismo `select` anidado que la carga inicial de la agenda (page.tsx) para reutilizar
 * la tarjeta AppointmentCard sin cambios. Un paciente nunca tendrá >1000 citas, así que el cap
 * por defecto de Supabase no afecta. Lo puede usar cualquier rol (solo requiere sesión + clínica).
 */
export async function getPatientAppointmentHistory(patientId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data: authProfile } = await supabase
    .from('user_profiles').select('clinic_id').eq('id', user.id).single()
  if (!authProfile?.clinic_id) return []

  const { data } = await supabase
    .from('appointments')
    .select(`
      id,
      scheduled_at,
      status,
      notes,
      duration_minutes,
      doctor_id,
      location_id,
      patients (
        id,
        first_name,
        last_name,
        phone,
        id_card,
        gender,
        birth_date
      )
    `)
    .eq('clinic_id', authProfile.clinic_id)
    .eq('patient_id', patientId)
    .order('scheduled_at', { ascending: false })

  return data || []
}

/** Ventana máxima que puede pedir el cliente de la agenda de una sola vez (~2 meses). */
const MAX_RANGE_DAYS = 62

/**
 * Citas de la clínica dentro de un rango de fechas (P0-1: la agenda ya no carga todo el
 * historial; el dashboard entrega una ventana inicial y AgendaClient pide por mes al
 * navegar fuera de ella). Mismo shape que la consulta del dashboard.
 */
export async function getAppointmentsForRange(startISO: string, endISO: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data: authProfile } = await supabase
    .from('user_profiles').select('clinic_id').eq('id', user.id).single()
  if (!authProfile?.clinic_id) return []

  const start = new Date(startISO)
  const end = new Date(endISO)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return []
  if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) return []

  const { data } = await supabase
    .from('appointments')
    .select(`
      id,
      scheduled_at,
      status,
      notes,
      duration_minutes,
      doctor_id,
      location_id,
      patients (
        id,
        first_name,
        last_name,
        phone,
        id_card,
        gender,
        birth_date
      ),
      booking_requests (
        id,
        status,
        submitted_first_name,
        submitted_last_name,
        submitted_phone
      )
    `)
    .eq('clinic_id', authProfile.clinic_id)
    .gte('scheduled_at', start.toISOString())
    .lt('scheduled_at', end.toISOString())
    .order('scheduled_at', { ascending: true })

  return data || []
}

/**
 * Una cita puntual con el mismo shape (joins) que el dashboard. La usa la sincronización en
 * vivo: cuando llega un INSERT por Realtime, la fila del evento no trae el nombre del paciente,
 * así que se pide solo esa cita para pintar la tarjeta. Acotada por clínica (RLS + defensa).
 */
export async function getAppointmentById(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: authProfile } = await supabase
    .from('user_profiles').select('clinic_id').eq('id', user.id).single()
  if (!authProfile?.clinic_id) return null

  const { data } = await supabase
    .from('appointments')
    .select(`
      id,
      scheduled_at,
      status,
      notes,
      duration_minutes,
      doctor_id,
      location_id,
      patients (
        id,
        first_name,
        last_name,
        phone,
        id_card,
        gender,
        birth_date
      ),
      booking_requests (
        id,
        status,
        submitted_first_name,
        submitted_last_name,
        submitted_phone
      )
    `)
    .eq('clinic_id', authProfile.clinic_id)
    .eq('id', id)
    .maybeSingle()

  return data ?? null
}

// ============================================================================
// Links públicos de auto-agendamiento (portal /agendar/[token])
// ============================================================================

/** Sesión + clínica del usuario (patrón compartido por las mutaciones de la agenda). */
async function getSessionClinic(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return null
  return { userId: user.id, clinicId: profile.clinic_id as string }
}

/** Links de agendamiento activos de la clínica, con médico y sede para el modal de la agenda. */
export async function listBookingLinks() {
  const supabase = await createClient()
  const session = await getSessionClinic(supabase)
  if (!session) return []

  const { data } = await supabase
    .from('public_booking_links')
    .select('id, token, doctor_id, location_id, created_at')
    .eq('clinic_id', session.clinicId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  return data || []
}

/**
 * Crea (o reemplaza) el link público de un médico + sede. Solo hay un link activo por
 * médico+sede: el anterior se desactiva (sus URLs viejas dejan de funcionar) y se genera
 * un token nuevo. Cualquier miembro del equipo puede hacerlo (igual que crear citas).
 */
export async function createBookingLink(doctorId: string, locationId: string | null) {
  const supabase = await createClient()
  const session = await getSessionClinic(supabase)
  if (!session) return { error: 'No autorizado' }

  // El médico debe ser de la clínica con rol clínico (mismo criterio que la agenda).
  const { data: doctor } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', doctorId)
    .eq('clinic_id', session.clinicId)
    .in('role', ['ADMIN', 'DOCTOR'])
    .maybeSingle()
  if (!doctor) return { error: 'Médico no válido.' }

  if (locationId) {
    const { data: location } = await supabase
      .from('locations')
      .select('id')
      .eq('id', locationId)
      .eq('clinic_id', session.clinicId)
      .eq('is_active', true)
      .maybeSingle()
    if (!location) return { error: 'Clínica (sede) no válida.' }
  } else if (await clinicHasActiveLocations(supabase, session.clinicId)) {
    // Igual que las citas: si el tenant maneja sedes, el link debe tener una.
    return { error: 'Selecciona una clínica para el enlace.' }
  }

  // Desactivar el link activo previo del mismo médico+sede (respeta el unique parcial de BD).
  let deactivate = supabase
    .from('public_booking_links')
    .update({ is_active: false })
    .eq('clinic_id', session.clinicId)
    .eq('doctor_id', doctorId)
    .eq('is_active', true)
  deactivate = locationId ? deactivate.eq('location_id', locationId) : deactivate.is('location_id', null)
  const { error: deactivateError } = await deactivate
  if (deactivateError) {
    return { error: safeErrorMessage('No se pudo generar el enlace.', 'createBookingLink', deactivateError) }
  }

  const token = generateBookingToken()
  const { error } = await supabase
    .from('public_booking_links')
    .insert([{
      clinic_id: session.clinicId,
      doctor_id: doctorId,
      location_id: locationId,
      token,
      created_by: session.userId,
    }])
  if (error) {
    return { error: safeErrorMessage('No se pudo generar el enlace.', 'createBookingLink', error) }
  }

  await supabase.rpc('log_audit_event', {
    p_action: 'CREATE_BOOKING_LINK',
    p_record_id: doctorId,
    p_table_name: 'public_booking_links',
  })

  return { success: true, token }
}

/** Desactiva un link público (las URLs compartidas dejan de funcionar de inmediato). */
export async function deactivateBookingLink(linkId: string) {
  const supabase = await createClient()
  const session = await getSessionClinic(supabase)
  if (!session) return { error: 'No autorizado' }

  const { data: updated, error } = await supabase
    .from('public_booking_links')
    .update({ is_active: false })
    .eq('id', linkId)
    .eq('clinic_id', session.clinicId)
    .select('id')
  if (error) return { error: safeErrorMessage('No se pudo desactivar el enlace.', 'deactivateBookingLink', error) }
  if (!updated || updated.length === 0) return { error: 'Enlace no encontrado.' }

  await supabase.rpc('log_audit_event', {
    p_action: 'DEACTIVATE_BOOKING_LINK',
    p_record_id: linkId,
    p_table_name: 'public_booking_links',
  })

  return { success: true }
}
