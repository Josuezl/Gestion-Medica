import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendAppointmentReminder } from '@/utils/whatsapp'
import { personShortName } from '@/utils/doctorName'
import { errorMessage } from '@/utils/errors'
import { formatDateTimeLongHN, formatTimeHN } from '@/utils/datetime'

/**
 * Cron de recordatorios de citas por WhatsApp (P0-2 de revision_tecnica_2026-07-05.md).
 *
 * Corre CADA HORA (vercel.json). Las ventanas son más anchas que el intervalo del cron para
 * que ninguna cita quede sin cubrir, y el solape entre corridas no duplica envíos porque cada
 * recordatorio se marca en la cita (reminder_24h_sent_at / reminder_2h_sent_at) y la consulta
 * filtra por `is null`. Si un envío falla, NO se marca: la siguiente corrida lo reintenta
 * mientras la cita siga dentro de la ventana.
 *
 * APAGADO POR DEFECTO: hoy los recordatorios los envía manualmente el personal con el botón
 * de la agenda. Este cron solo envía si AUTO_REMINDERS_ENABLED=true está configurado en
 * Vercel, para que activarlo sea una decisión explícita y no un efecto colateral de un deploy.
 */

// Margen para los envíos de WhatsApp (secuenciales por lotes); el default de Vercel puede quedar corto.
export const maxDuration = 60

// Los joins patients(...)/user_profiles(...) llegan a-uno como objeto (aunque la inferencia diga arreglo).
type ReminderPatient = { first_name?: string | null; last_name?: string | null; phone?: string | null } | null
type ReminderDoctor = { first_name?: string | null; last_name?: string | null } | null

interface ReminderAppointment {
  id: string
  scheduled_at: string
  patients: ReminderPatient
  user_profiles: ReminderDoctor
}

const HOUR_MS = 60 * 60 * 1000
/** Envíos simultáneos a la Cloud API de Meta por lote. */
const SEND_BATCH_SIZE = 5

async function fetchPendingReminders(
  admin: SupabaseClient,
  sentAtColumn: 'reminder_24h_sent_at' | 'reminder_2h_sent_at',
  fromMs: number,
  toMs: number,
): Promise<ReminderAppointment[]> {
  const { data, error } = await admin
    .from('appointments')
    .select(`
      id,
      scheduled_at,
      patients ( first_name, last_name, phone ),
      user_profiles ( first_name, last_name )
    `)
    .eq('status', 'CONFIRMED')
    .is(sentAtColumn, null)
    .gte('scheduled_at', new Date(fromMs).toISOString())
    .lte('scheduled_at', new Date(toMs).toISOString())
  if (error) throw new Error(`Consulta de recordatorios (${sentAtColumn}): ${error.message}`)
  return (data as unknown as ReminderAppointment[]) || []
}

/**
 * Envía los recordatorios en lotes con concurrencia limitada y marca cada cita como
 * notificada SOLO si el envío fue exitoso. Devuelve cuántos se enviaron y cuántos fallaron.
 */
async function sendBatch(
  admin: SupabaseClient,
  appointments: ReminderAppointment[],
  sentAtColumn: 'reminder_24h_sent_at' | 'reminder_2h_sent_at',
  formatWhen: (scheduledAt: string) => string,
): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0

  for (let i = 0; i < appointments.length; i += SEND_BATCH_SIZE) {
    const batch = appointments.slice(i, i + SEND_BATCH_SIZE)
    const results = await Promise.allSettled(batch.map(async (app) => {
      const patient = app.patients
      if (!patient?.phone) return false

      const doctor = app.user_profiles
      const docName = doctor ? `Dr. ${personShortName(doctor.first_name, doctor.last_name)}` : 'tu consultorio'
      const patientName = `${patient.first_name} ${patient.last_name}`

      const response = await sendAppointmentReminder(patient.phone, patientName, docName, formatWhen(app.scheduled_at))
      if (!response.success) throw new Error(response.error || 'Envío de WhatsApp falló')

      const { error: markError } = await admin
        .from('appointments')
        .update({ [sentAtColumn]: new Date().toISOString() })
        .eq('id', app.id)
      // Si el marcado falla, se registra: la próxima corrida re-enviaría este recordatorio.
      if (markError) console.error(`No se pudo marcar ${sentAtColumn} de la cita ${app.id}:`, markError.message)
      return true
    }))

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value) sent++
      } else {
        failed++
        console.error(`Recordatorio (${sentAtColumn}) falló:`, r.reason)
      }
    }
  }

  return { sent, failed }
}

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('Advertencia: Variables de entorno de Supabase no configuradas durante la compilación.')
    return NextResponse.json({ success: false, error: 'Credenciales de Supabase no configuradas.' }, { status: 500 })
  }

  // Proteger el endpoint con un token de autorización OBLIGATORIO (fail-closed):
  // si CRON_SECRET no está configurado, o el header no coincide, se rechaza.
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  // Interruptor explícito: los recordatorios hoy son manuales (botón del asistente en la agenda).
  if (process.env.AUTO_REMINDERS_ENABLED !== 'true') {
    return NextResponse.json({ success: true, skipped: 'Recordatorios automáticos desactivados (AUTO_REMINDERS_ENABLED != true).' })
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const nowMs = Date.now()

    // Ventanas más anchas que el intervalo horario del cron (idempotentes vía reminder_*_sent_at):
    // 24 h: citas de mañana a la misma hora ±1 h · 2 h: citas dentro de 1 a 3 horas.
    const appts24h = await fetchPendingReminders(supabaseAdmin, 'reminder_24h_sent_at', nowMs + 23 * HOUR_MS, nowMs + 25 * HOUR_MS)
    const appts2h = await fetchPendingReminders(supabaseAdmin, 'reminder_2h_sent_at', nowMs + 1 * HOUR_MS, nowMs + 3 * HOUR_MS)

    const result24h = await sendBatch(supabaseAdmin, appts24h, 'reminder_24h_sent_at', (at) => formatDateTimeLongHN(at))
    const result2h = await sendBatch(supabaseAdmin, appts2h, 'reminder_2h_sent_at', (at) => `Hoy a las ${formatTimeHN(at)}`)

    return NextResponse.json({
      success: true,
      reminders_sent: result24h.sent + result2h.sent,
      failed: result24h.failed + result2h.failed,
      detail: { h24: result24h, h2: result2h },
    }, { status: 200 })
  } catch (error) {
    console.error('Error enviando recordatorios programados:', error)
    return NextResponse.json({ success: false, error: errorMessage(error, 'Error interno') }, { status: 500 })
  }
}
