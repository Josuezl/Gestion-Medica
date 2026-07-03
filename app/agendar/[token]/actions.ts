'use server'

/**
 * Server actions PÚBLICAS del portal de auto-agendamiento (/agendar/[token]).
 *
 * El actor es un paciente anónimo: no hay sesión ni RLS que lo cubra, así que todo va con el
 * admin client (service_role) y la "autorización" es el token del link activo + rate limiting
 * por IP. Reglas de seguridad:
 *  - Nunca devolver datos de pacientes (solo found/not_found) ni IDs internos.
 *  - Nunca confiar en el cliente: el matching de paciente se re-ejecuta aquí y el slot se
 *    re-valida contra la disponibilidad real; la inserción final es un RPC atómico en Postgres.
 */

import { createAdminClient } from '@/utils/supabase/admin'
import { sanitizeName } from '@/utils/validation'
import { buildAvailability, bookingWindowEndYMD, hondurasTodayYMD, matchPatientRecord, splitFullName, schedulesForLocation, type ScheduleRange, type BlockingAppointment, type DoctorBlock } from '@/utils/booking'
import { checkRateLimit } from '@/utils/rateLimit'
import { getClientIp } from '@/utils/clientIp'
import { sanitizePhone } from '@/utils/phone'
import { generateVerificationCode } from '@/utils/verification-code'
import { safeErrorMessage } from '@/utils/errors'

const LINK_ERROR = 'Este enlace de agendamiento no está disponible. Comunícate con la clínica.'
const RATE_ERROR = 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'

const TOKEN_RE = /^[A-Za-z0-9_-]{10,64}$/
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const HHMM_RE = /^\d{2}:\d{2}$/

interface BookingLinkRow {
  id: string
  clinic_id: string
  doctor_id: string
  location_id: string | null
}

/** Resuelve el link ACTIVO por token, o null (token inválido, inexistente o desactivado). */
async function resolveActiveLink(admin: ReturnType<typeof createAdminClient>, token: string): Promise<BookingLinkRow | null> {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null
  const { data } = await admin
    .from('public_booking_links')
    .select('id, clinic_id, doctor_id, location_id')
    .eq('token', token)
    .eq('is_active', true)
    .maybeSingle()
  return data
}

/**
 * Pacientes de la clínica para el matching por nombre (solo id + nombre, en memoria).
 *
 * PAGINADO obligatorio: el Data API de Supabase tope las respuestas a 1000 filas por request
 * aunque se pida `.limit(10000)` — verificado contra la BD real (una clínica de ~6900 pacientes
 * devolvía solo 1000 y el matching fallaba para el resto). Se recorre por páginas de 1000 con
 * un tope de seguridad de 20k.
 */
async function loadClinicPatients(admin: ReturnType<typeof createAdminClient>, clinicId: string) {
  const PAGE = 1000
  const MAX_PAGES = 20
  const all: { id: string; first_name: string | null; last_name: string | null; id_card: string | null }[] = []
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data } = await admin
      .from('patients')
      .select('id, first_name, last_name, id_card')
      .eq('clinic_id', clinicId)
      .order('id', { ascending: true })
      .range(i * PAGE, i * PAGE + PAGE - 1)
    const rows = data || []
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

/**
 * Disponibilidad real del médico: horario semanal menos citas vivas de los próximos 30 días.
 * El horario se resuelve por SEDE del link: si el médico tiene rangos propios de esa sede se
 * usan solo esos; si no, su horario general (schedulesForLocation).
 */
async function loadAvailability(admin: ReturnType<typeof createAdminClient>, link: BookingLinkRow) {
  const { data: allSchedules } = await admin
    .from('doctor_schedules')
    .select('weekday, start_time, end_time, location_id')
    .eq('doctor_id', link.doctor_id)
    .eq('clinic_id', link.clinic_id)

  const schedules = schedulesForLocation(allSchedules || [], link.location_id)
  if (schedules.length === 0) return {}

  const now = new Date()
  const todayYMD = hondurasTodayYMD(now)
  const fromIso = new Date(now.getTime() - 24 * 60 * 60_000).toISOString()
  // Hasta el fin de la ventana de 3 meses (+1 día de margen por el desfase UTC/Honduras).
  const endYMD = bookingWindowEndYMD(todayYMD)
  const toIso = new Date(`${endYMD}T23:59:59-06:00`).toISOString()
  // Citas vivas y días bloqueados (vacaciones/congresos) del médico, de cualquier sede:
  // el médico no puede estar en dos lugares.
  const [{ data: appointments }, { data: blocks }] = await Promise.all([
    admin
      .from('appointments')
      .select('scheduled_at, duration_minutes, status')
      .eq('doctor_id', link.doctor_id)
      .gte('scheduled_at', fromIso)
      .lte('scheduled_at', toIso),
    admin
      .from('doctor_schedule_blocks')
      .select('start_date, end_date')
      .eq('doctor_id', link.doctor_id)
      .gte('end_date', todayYMD)
      .lte('start_date', endYMD),
  ])

  return buildAvailability(
    (schedules as ScheduleRange[]) || [],
    (appointments as BlockingAppointment[]) || [],
    now,
    (blocks as DoctorBlock[]) || [],
  )
}

/**
 * Paso 1 del portal: ¿el nombre completo (y opcionalmente la identidad) corresponde a
 * EXACTAMENTE un paciente de la clínica? La identidad manda: si coincide con un paciente
 * único, lo encontramos aunque el nombre venga escrito distinto. Solo devuelve
 * found/not_found — jamás datos del paciente (un tercero no debe poder confirmar quién es
 * paciente más allá de este bit, y el rate limit frena el sondeo de nombres).
 */
export async function identifyPatient(
  token: string,
  fullName: string,
  idCard?: string,
): Promise<{ status: 'found' | 'not_found' } | { error: string }> {
  try {
    const admin = createAdminClient()

    const ip = await getClientIp()
    if (ip && !(await checkRateLimit(admin, `id:${ip}`, 10, 600))) {
      return { error: RATE_ERROR }
    }

    const link = await resolveActiveLink(admin, token)
    if (!link) return { error: LINK_ERROR }

    const cleanName = sanitizeName(fullName, '')
    if (splitFullName(cleanName).words < 2) {
      return { error: 'Escribe tu nombre completo (nombres y apellidos).' }
    }
    const cleanIdCard = (idCard || '').trim().slice(0, 30) || null

    const patients = await loadClinicPatients(admin, link.clinic_id)
    const match = matchPatientRecord(patients, cleanName, cleanIdCard)
    return { status: match ? 'found' : 'not_found' }
  } catch (e) {
    return { error: safeErrorMessage('No se pudo verificar el nombre. Inténtalo de nuevo.', 'identifyPatient', e) }
  }
}

/** Paso 2 del portal: días y horas disponibles (slots de 1 hora, ventana de 3 meses). */
export async function getAvailability(
  token: string,
): Promise<{ days: Record<string, string[]> } | { error: string }> {
  try {
    const admin = createAdminClient()

    const ip = await getClientIp()
    if (ip && !(await checkRateLimit(admin, `avail:${ip}`, 30, 600))) {
      return { error: RATE_ERROR }
    }

    const link = await resolveActiveLink(admin, token)
    if (!link) return { error: LINK_ERROR }

    return { days: await loadAvailability(admin, link) }
  } catch (e) {
    return { error: safeErrorMessage('No se pudo cargar la disponibilidad. Inténtalo de nuevo.', 'getAvailability', e) }
  }
}

export interface SubmitBookingPayload {
  fullName: string // caja única del portal (≥4 palabras; se divide con splitFullName)
  date: string // YYYY-MM-DD (slot elegido)
  time: string // HH:MM
  idCard?: string // identidad opcional (ayuda al matching y va a la solicitud)
  birthDate?: string // solo pacientes nuevos
  phone?: string // solo pacientes nuevos
}

/**
 * Paso final: crea la cita PENDING_REVIEW + la solicitud, de forma atómica (RPC con advisory
 * lock por médico). El matching de paciente se RE-ejecuta aquí con el nombre enviado — el
 * cliente nunca manda un patient_id. Si no hay match, la ficha NO se crea todavía: los datos
 * viajan en booking_requests y el staff decide al aprobar.
 */
export async function submitBooking(
  token: string,
  payload: SubmitBookingPayload,
): Promise<{ trackingCode: string } | { error: string }> {
  try {
    const admin = createAdminClient()

    const ip = await getClientIp()
    if (ip && !(await checkRateLimit(admin, `book:${ip}`, 5, 3600))) {
      return { error: RATE_ERROR }
    }

    const link = await resolveActiveLink(admin, token)
    if (!link) return { error: LINK_ERROR }

    const cleanName = sanitizeName(payload.fullName, '')
    const { firstName: first, lastName: last, words } = splitFullName(cleanName)
    if (words < 2 || !first || !last) return { error: 'Escribe tu nombre completo (nombres y apellidos).' }

    if (!YMD_RE.test(payload.date) || !HHMM_RE.test(payload.time)) {
      return { error: 'Selecciona una fecha y hora válidas.' }
    }

    const idCard = (payload.idCard || '').trim().slice(0, 30) || null
    // Datos de registro (solo se usan si el paciente NO existe todavía).
    const birthDate = (payload.birthDate || '').trim()
    const phone = payload.phone ? sanitizePhone(payload.phone) : null

    // Re-matching en servidor (identidad primero): la fuente de verdad, no lo que diga el cliente.
    const patients = await loadClinicPatients(admin, link.clinic_id)
    const match = matchPatientRecord(patients, cleanName, idCard)

    if (!match) {
      if (!YMD_RE.test(birthDate)) return { error: 'Indica tu fecha de nacimiento.' }
      const year = Number(birthDate.slice(0, 4))
      if (year < 1900 || new Date(`${birthDate}T00:00:00-06:00`).getTime() > Date.now()) {
        return { error: 'La fecha de nacimiento no es válida.' }
      }
      if (!phone) return { error: 'Indica un número de teléfono para contactarte.' }
    }

    // Re-validar el slot contra la disponibilidad REAL (horario, ventana, ocupación, pasado).
    const days = await loadAvailability(admin, link)
    if (!days[payload.date]?.includes(payload.time)) {
      return { error: 'Ese horario ya no está disponible. Elige otro, por favor.' }
    }

    const scheduledAt = new Date(`${payload.date}T${payload.time}:00-06:00`).toISOString()
    const trackingCode = generateVerificationCode('CITA')

    const { data, error } = await admin.rpc('create_public_booking', {
      p_link_id: link.id,
      p_matched_patient_id: match?.id ?? null,
      p_scheduled_at: scheduledAt,
      p_first_name: first,
      p_last_name: last,
      p_birth_date: match ? null : birthDate,
      p_id_card: idCard, // la identidad tecleada siempre viaja (ayuda al staff a verificar)
      p_phone: match ? null : phone,
      p_tracking_code: trackingCode,
      p_ip: ip,
    })

    if (error) {
      const msg = error.message || ''
      if (msg.includes('SLOT_TAKEN')) return { error: 'Ese horario acaba de ocuparse. Elige otro, por favor.' }
      if (msg.includes('IP_PENDING') || msg.includes('PATIENT_PENDING')) {
        return { error: 'Ya tienes una solicitud de cita pendiente de aprobación con este médico. Consulta su estado con tu código o comunícate con la clínica.' }
      }
      if (msg.includes('LINK_INACTIVE')) return { error: LINK_ERROR }
      return { error: safeErrorMessage('No se pudo agendar la cita. Inténtalo de nuevo.', 'submitBooking', error) }
    }

    // Auditoría con IP del actor anónimo (log_audit_event no aplica: requiere auth.uid()).
    const requestId = data?.[0]?.request_id
    if (requestId) {
      await admin.from('audit_logs').insert({
        clinic_id: link.clinic_id,
        performed_by: null,
        action: 'PUBLIC_BOOKING_CREATED',
        record_id: requestId,
        table_name: 'booking_requests',
        ip_address: ip,
        metadata: { doctor_id: link.doctor_id, scheduled_at: scheduledAt, matched: !!match },
      })
    }

    return { trackingCode }
  } catch (e) {
    return { error: safeErrorMessage('No se pudo agendar la cita. Inténtalo de nuevo.', 'submitBooking', e) }
  }
}
