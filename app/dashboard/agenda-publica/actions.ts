'use server'

/**
 * Server actions de la sección "Agenda en línea" (enlaces públicos + horarios por médico).
 * Las gestiona TODO el personal de la clínica (asistentes, médicos, enfermería) — igual que
 * las citas; la RLS de doctor_schedules se relajó en 20260703000000 para acompañar esto.
 */

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateScheduleRanges } from '@/utils/booking'
import { safeErrorMessage } from '@/utils/errors'

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

/**
 * Guarda el horario semanal de un médico para el portal público, por SEDE: `locationId` null =
 * horario general; con sede = horario propio de esa clínica (el portal usa el de la sede del
 * link si existe, si no cae al general). Reemplaza los rangos de ese médico+sede por los
 * recibidos (delete + insert: configuración de bajo volumen; si falla, se reintenta).
 * Solo afecta qué slots ofrece el portal público; la agenda interna no cambia.
 */
export async function saveDoctorSchedule(
  doctorId: string,
  locationId: string | null,
  ranges: { weekday: number; start: string; end: string }[],
) {
  const supabase = await createClient()
  const session = await getSessionClinic(supabase)
  if (!session) return { error: 'No autorizado' }

  // El médico debe ser de la clínica y tener rol clínico (mismo criterio que la agenda).
  const { data: doctor } = await supabase
    .from('user_profiles')
    .select('id, role')
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
      .maybeSingle()
    if (!location) return { error: 'Clínica (sede) no válida.' }
  }

  const rangesError = validateScheduleRanges(ranges)
  if (rangesError) return { error: rangesError }

  let deleteQuery = supabase
    .from('doctor_schedules')
    .delete()
    .eq('doctor_id', doctorId)
    .eq('clinic_id', session.clinicId)
  deleteQuery = locationId ? deleteQuery.eq('location_id', locationId) : deleteQuery.is('location_id', null)
  const { error: deleteError } = await deleteQuery
  if (deleteError) return { error: safeErrorMessage('No se pudo actualizar el horario.', 'saveDoctorSchedule', deleteError) }

  if (ranges.length > 0) {
    const { error: insertError } = await supabase
      .from('doctor_schedules')
      .insert(ranges.map(r => ({
        clinic_id: session.clinicId,
        doctor_id: doctorId,
        location_id: locationId,
        weekday: r.weekday,
        start_time: r.start,
        end_time: r.end,
      })))
    if (insertError) return { error: safeErrorMessage('No se pudo guardar el horario.', 'saveDoctorSchedule', insertError) }
  }

  await supabase.rpc('log_audit_event', {
    p_action: 'SAVE_DOCTOR_SCHEDULE',
    p_record_id: doctorId,
    p_table_name: 'doctor_schedules',
  })

  revalidatePath('/dashboard/agenda-publica')
  return { success: true }
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Bloquea un rango de días del médico (vacaciones, congreso, permiso): el portal público
 * deja de ofrecer esas fechas en TODAS sus sedes. La agenda interna no se ve afectada.
 */
export async function createDoctorBlock(
  doctorId: string,
  startDate: string,
  endDate: string,
  reason?: string,
) {
  const supabase = await createClient()
  const session = await getSessionClinic(supabase)
  if (!session) return { error: 'No autorizado' }

  const { data: doctor } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', doctorId)
    .eq('clinic_id', session.clinicId)
    .in('role', ['ADMIN', 'DOCTOR'])
    .maybeSingle()
  if (!doctor) return { error: 'Médico no válido.' }

  if (!YMD_RE.test(startDate) || !YMD_RE.test(endDate)) {
    return { error: 'Selecciona las fechas del bloqueo.' }
  }
  if (endDate < startDate) {
    return { error: 'La fecha final debe ser igual o posterior a la inicial.' }
  }

  const { data: created, error } = await supabase
    .from('doctor_schedule_blocks')
    .insert([{
      clinic_id: session.clinicId,
      doctor_id: doctorId,
      start_date: startDate,
      end_date: endDate,
      reason: (reason || '').trim().slice(0, 200) || null,
      created_by: session.userId,
    }])
    .select('id')
    .single()
  if (error || !created) return { error: safeErrorMessage('No se pudo crear el bloqueo.', 'createDoctorBlock', error) }

  await supabase.rpc('log_audit_event', {
    p_action: 'CREATE_DOCTOR_BLOCK',
    p_record_id: created.id,
    p_table_name: 'doctor_schedule_blocks',
  })

  revalidatePath('/dashboard/agenda-publica')
  return { success: true }
}

/** Elimina un bloqueo de días (el portal vuelve a ofrecer esas fechas). */
export async function deleteDoctorBlock(blockId: string) {
  const supabase = await createClient()
  const session = await getSessionClinic(supabase)
  if (!session) return { error: 'No autorizado' }

  const { data: deleted, error } = await supabase
    .from('doctor_schedule_blocks')
    .delete()
    .eq('id', blockId)
    .eq('clinic_id', session.clinicId)
    .select('id')
  if (error) return { error: safeErrorMessage('No se pudo eliminar el bloqueo.', 'deleteDoctorBlock', error) }
  if (!deleted || deleted.length === 0) return { error: 'Bloqueo no encontrado.' }

  await supabase.rpc('log_audit_event', {
    p_action: 'DELETE_DOCTOR_BLOCK',
    p_record_id: blockId,
    p_table_name: 'doctor_schedule_blocks',
  })

  revalidatePath('/dashboard/agenda-publica')
  return { success: true }
}
