'use server'

/**
 * Server actions del flujo de revisión de solicitudes del portal público (staff autenticado).
 * Aprobar crea la ficha del paciente (o asigna una existente) y confirma la cita; rechazar
 * cancela la cita. Ambas devuelven el material para el prompt de WhatsApp click-to-chat
 * (mismo patrón manual del botón de la agenda: abre la app, no envía solo).
 */

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { safeErrorMessage } from '@/utils/errors'
import { sanitizePhone } from '@/utils/phone'
import { findDuplicatePatient } from '@/utils/patientDuplicates'
import { isPediatric } from '@/utils/age'
import { doctorShortName } from '@/utils/doctorName'
import { formatDateTimeHN } from '@/utils/datetime'
import { isBlockingStatus, PORTAL_SLOT_MINUTES } from '@/utils/booking'

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const HHMM_RE = /^\d{2}:\d{2}$/

export interface ApproveDecision {
  mode: 'new' | 'existing'
  existingPatientId?: string
  // Ficha nueva (prefill desde lo enviado, editable por el staff). El género lo exige la BD
  // (patients.gender NOT NULL) y el portal no lo pide: lo aporta el staff aquí.
  newPatient?: {
    firstName: string
    lastName: string
    birthDate: string
    gender: 'M' | 'F'
    idCard?: string
    phone?: string
  }
  force?: boolean // continuar pese a un AVISO de duplicado (los bloqueos nunca se saltan)
  // Edición opcional del slot antes de aprobar.
  date?: string // YYYY-MM-DD
  time?: string // HH:MM
  finalStatus?: 'CONFIRMED' | 'PENDING'
}

export interface WhatsAppPrompt {
  phone: string // solo dígitos, listo para api.whatsapp.com/send?phone=
  message: string
}

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

/** Carga la solicitud PENDING con su cita, acotada a la clínica del usuario. */
async function loadPendingRequest(supabase: Awaited<ReturnType<typeof createClient>>, requestId: string, clinicId: string) {
  const { data } = await supabase
    .from('booking_requests')
    .select(`
      id, clinic_id, appointment_id, doctor_id, location_id, matched_patient_id, status,
      submitted_first_name, submitted_last_name, submitted_birth_date, submitted_id_card, submitted_phone,
      appointments ( id, scheduled_at, status, duration_minutes ),
      doctor:user_profiles!booking_requests_doctor_id_fkey ( first_name, last_name, gender ),
      locations ( name )
    `)
    .eq('id', requestId)
    .eq('clinic_id', clinicId)
    .eq('status', 'PENDING')
    .maybeSingle()
  return data as any
}

/** ¿Otra cita viva del médico solapa este slot de 1 hora? (para cuando el staff mueve la fecha). */
async function slotConflicts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  doctorId: string,
  excludeAppointmentId: string,
  scheduledAtIso: string,
): Promise<boolean> {
  const slotStart = new Date(scheduledAtIso).getTime()
  const slotEnd = slotStart + PORTAL_SLOT_MINUTES * 60_000
  // Ventana generosa alrededor del slot (las citas duran máx. 480 min).
  const from = new Date(slotStart - 8 * 60 * 60_000).toISOString()
  const to = new Date(slotEnd).toISOString()
  const { data } = await supabase
    .from('appointments')
    .select('id, scheduled_at, duration_minutes, status')
    .eq('doctor_id', doctorId)
    .neq('id', excludeAppointmentId)
    .gte('scheduled_at', from)
    .lt('scheduled_at', to)
  return (data || []).some(a => {
    if (!isBlockingStatus(a.status)) return false
    const start = new Date(a.scheduled_at).getTime()
    const end = start + (a.duration_minutes ?? 15) * 60_000
    return start < slotEnd && end > slotStart
  })
}

function buildWhatsAppPrompt(
  rawPhone: string | null | undefined,
  firstName: string,
  message: string,
): WhatsAppPrompt | undefined {
  const digits = (rawPhone || '').replace(/\D/g, '')
  if (!digits) return undefined
  return { phone: digits, message: message.replace('{nombre}', firstName) }
}

export async function approveBookingRequest(requestId: string, decision: ApproveDecision): Promise<
  | { success: true; whatsapp?: WhatsAppPrompt }
  | { error: string }
  | { duplicate: { id: string; name: string; birthDate: string | null; block: boolean } }
> {
  const supabase = await createClient()
  const session = await getSessionClinic(supabase)
  if (!session) return { error: 'No autorizado' }

  const request = await loadPendingRequest(supabase, requestId, session.clinicId)
  if (!request) return { error: 'La solicitud ya no está pendiente (pudo aprobarse o rechazarse en otra pestaña).' }
  if (!request.appointments?.id) return { error: 'La cita de esta solicitud ya no existe. Recházala para cerrarla.' }

  // Paciente ya identificado por el matching del portal: la cita es suya; crear otra ficha
  // duplicaría al paciente (la UI ni lo ofrece — defensa en profundidad).
  if (request.matched_patient_id && decision.mode === 'new') {
    return { error: 'Este paciente ya está identificado en el sistema: no se puede crear otra ficha.' }
  }

  // --- 1. Resolver el paciente (crear ficha o asignar existente) ---
  let patientId: string
  let patientFirstName: string
  let patientPhone: string | null = request.submitted_phone

  if (decision.mode === 'existing') {
    if (!decision.existingPatientId) return { error: 'Selecciona el paciente a asignar.' }
    const { data: patient } = await supabase
      .from('patients')
      .select('id, first_name, phone')
      .eq('id', decision.existingPatientId)
      .eq('clinic_id', session.clinicId)
      .maybeSingle()
    if (!patient) return { error: 'Paciente no válido.' }
    patientId = patient.id
    patientFirstName = patient.first_name || request.submitted_first_name
    patientPhone = patient.phone || request.submitted_phone
  } else {
    const np = decision.newPatient
    if (!np) return { error: 'Faltan los datos del paciente nuevo.' }
    const firstName = (np.firstName || '').trim()
    const lastName = (np.lastName || '').trim()
    if (!firstName || !lastName) return { error: 'Nombre y apellidos son obligatorios.' }
    if (np.gender !== 'M' && np.gender !== 'F') return { error: 'Selecciona el género del paciente.' }
    if (!YMD_RE.test(np.birthDate || '')) return { error: 'Indica la fecha de nacimiento del paciente.' }

    const idCard = (np.idCard || '').trim() || null
    const phone = np.phone ? sanitizePhone(np.phone) : null

    // Mismo control anti-duplicados que createPatient: bloqueo imposible de saltar; aviso con force.
    const dup = await findDuplicatePatient(supabase, session.clinicId, firstName, lastName, np.birthDate, np.gender, idCard)
    if (dup?.block) return { duplicate: { id: dup.id, name: dup.name, birthDate: dup.birthDate, block: true } }
    if (dup && !decision.force) return { duplicate: { id: dup.id, name: dup.name, birthDate: dup.birthDate, block: false } }

    const { data: created, error: createError } = await supabase
      .from('patients')
      .insert([{
        clinic_id: session.clinicId,
        created_by: session.userId,
        first_name: firstName,
        last_name: lastName,
        id_card: idCard,
        gender: np.gender,
        birth_date: np.birthDate,
        phone,
        is_pediatric: isPediatric(np.birthDate),
        dob_status: 'exact',
      }])
      .select('id, first_name, phone')
      .single()
    if (createError || !created) {
      return { error: safeErrorMessage('No se pudo crear la ficha del paciente.', 'approveBookingRequest', createError) }
    }
    patientId = created.id
    patientFirstName = created.first_name
    patientPhone = created.phone || request.submitted_phone

    await supabase.rpc('log_audit_event', {
      p_action: 'CREATE_PATIENT',
      p_record_id: patientId,
      p_table_name: 'patients',
    })
  }

  // --- 2. Actualizar la cita: paciente + estado final (+ fecha/hora si el staff la movió) ---
  const finalStatus = decision.finalStatus === 'PENDING' ? 'PENDING' : 'CONFIRMED'
  const update: Record<string, unknown> = { patient_id: patientId, status: finalStatus }

  if (decision.date || decision.time) {
    if (!YMD_RE.test(decision.date || '') || !HHMM_RE.test(decision.time || '')) {
      return { error: 'Fecha u hora no válidas.' }
    }
    const scheduledAt = new Date(`${decision.date}T${decision.time}:00-06:00`).toISOString()
    if (scheduledAt !== request.appointments.scheduled_at &&
        await slotConflicts(supabase, request.doctor_id, request.appointments.id, scheduledAt)) {
      return { error: 'El nuevo horario choca con otra cita del médico. Elige otra hora.' }
    }
    update.scheduled_at = scheduledAt
  }

  const { data: updatedAppt, error: apptError } = await supabase
    .from('appointments')
    .update(update)
    .eq('id', request.appointments.id)
    .eq('clinic_id', session.clinicId)
    .select('id, scheduled_at')
    .single()
  if (apptError || !updatedAppt) {
    return { error: safeErrorMessage('No se pudo aprobar la cita.', 'approveBookingRequest', apptError) }
  }

  // --- 3. Cerrar la solicitud ---
  const { error: reqError } = await supabase
    .from('booking_requests')
    .update({
      status: 'APPROVED',
      matched_patient_id: patientId,
      reviewed_by: session.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', request.id)
    .eq('clinic_id', session.clinicId)
  if (reqError) {
    return { error: safeErrorMessage('La cita se actualizó pero no se pudo cerrar la solicitud.', 'approveBookingRequest', reqError) }
  }

  await supabase.rpc('log_audit_event', {
    p_action: 'APPROVE_BOOKING_REQUEST',
    p_record_id: request.id,
    p_table_name: 'booking_requests',
  })

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/solicitudes')

  const docName = doctorShortName(request.doctor?.first_name, request.doctor?.last_name, request.doctor?.gender)
  const place = request.locations?.name ? `\n📍 Lugar: ${request.locations.name}` : ''
  const message = `Hola {nombre}, tu cita fue APROBADA ✅\n\n📅 Fecha y hora: ${formatDateTimeHN(updatedAppt.scheduled_at)}\n🩺 Médico: ${docName}${place}\n\nPor favor, confírmanos tu asistencia respondiendo a este mensaje. ¡Te esperamos!`
  return { success: true, whatsapp: buildWhatsAppPrompt(patientPhone, patientFirstName, message) }
}

export async function rejectBookingRequest(requestId: string, reason?: string): Promise<
  | { success: true; whatsapp?: WhatsAppPrompt }
  | { error: string }
> {
  const supabase = await createClient()
  const session = await getSessionClinic(supabase)
  if (!session) return { error: 'No autorizado' }

  const request = await loadPendingRequest(supabase, requestId, session.clinicId)
  if (!request) return { error: 'La solicitud ya no está pendiente (pudo aprobarse o rechazarse en otra pestaña).' }

  // Cancelar la cita libera el slot; el trigger de BD marca la solicitud como REJECTED.
  if (request.appointments?.id) {
    const { error: apptError } = await supabase
      .from('appointments')
      .update({ status: 'CANCELLED' })
      .eq('id', request.appointments.id)
      .eq('clinic_id', session.clinicId)
    if (apptError) {
      return { error: safeErrorMessage('No se pudo rechazar la solicitud.', 'rejectBookingRequest', apptError) }
    }
  }

  // Completar el cierre con el motivo real y el revisor (el trigger dejó un motivo genérico).
  const cleanReason = (reason || '').trim().slice(0, 300) || null
  const { error: reqError } = await supabase
    .from('booking_requests')
    .update({
      status: 'REJECTED',
      rejection_reason: cleanReason ?? undefined,
      reviewed_by: session.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', request.id)
    .eq('clinic_id', session.clinicId)
  if (reqError) {
    return { error: safeErrorMessage('No se pudo cerrar la solicitud.', 'rejectBookingRequest', reqError) }
  }

  await supabase.rpc('log_audit_event', {
    p_action: 'REJECT_BOOKING_REQUEST',
    p_record_id: request.id,
    p_table_name: 'booking_requests',
  })

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/solicitudes')

  const docName = doctorShortName(request.doctor?.first_name, request.doctor?.last_name, request.doctor?.gender)
  const motivo = cleanReason ? `\n\nMotivo: ${cleanReason}` : ''
  const message = `Hola {nombre}, lamentamos informarte que tu solicitud de cita con ${docName} del ${formatDateTimeHN(request.appointments?.scheduled_at || new Date())} no fue aprobada.${motivo}\n\nPor favor comunícate con nosotros para reagendarla. Gracias por tu comprensión.`
  const phone = request.matched_patient_id
    ? (await supabase.from('patients').select('phone').eq('id', request.matched_patient_id).maybeSingle()).data?.phone || request.submitted_phone
    : request.submitted_phone
  return { success: true, whatsapp: buildWhatsAppPrompt(phone, request.submitted_first_name, message) }
}
