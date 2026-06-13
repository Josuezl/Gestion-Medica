import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendAppointmentReminder } from '@/utils/whatsapp'
import { personShortName } from '@/utils/doctorName'

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('Advertencia: Variables de entorno de Supabase no configuradas durante la compilación.')
    return NextResponse.json({ success: false, error: 'Credenciales de Supabase no configuradas.' }, { status: 500 })
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

  // Proteger el endpoint con un token de autorización OBLIGATORIO (fail-closed):
  // si CRON_SECRET no está configurado, o el header no coincide, se rechaza.
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  try {
    const now = new Date()

    // 1. Recordatorio de 24 horas: Citas que ocurren mañana (en 23h a 25h)
    const range24hStart = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString()
    const range24hEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString()

    const { data: appts24h } = await supabaseAdmin
      .from('appointments')
      .select(`
        id,
        scheduled_at,
        patients (
          first_name,
          last_name,
          phone
        ),
        user_profiles (
          first_name,
          last_name
        )
      `)
      .eq('status', 'CONFIRMED')
      .gte('scheduled_at', range24hStart)
      .lte('scheduled_at', range24hEnd)

    // 2. Recordatorio de 2 horas: Citas que ocurren hoy (en 1.5h a 2.5h)
    const range2hStart = new Date(now.getTime() + 1.5 * 60 * 60 * 1000).toISOString()
    const range2hEnd = new Date(now.getTime() + 2.5 * 60 * 60 * 1000).toISOString()

    const { data: appts2h } = await supabaseAdmin
      .from('appointments')
      .select(`
        id,
        scheduled_at,
        patients (
          first_name,
          last_name,
          phone
        ),
        user_profiles (
          first_name,
          last_name
        )
      `)
      .eq('status', 'CONFIRMED')
      .gte('scheduled_at', range2hStart)
      .lte('scheduled_at', range2hEnd)

    let sentCount = 0

    // Enviar recordatorios de 24 horas
    if (appts24h) {
      for (const app of appts24h) {
        const patient = app.patients as any
        const doctor = app.user_profiles as any
        
        if (patient?.phone) {
          const apptDate = new Date(app.scheduled_at)
          const formattedDate = apptDate.toLocaleDateString('es-HN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })

          const docName = doctor ? `Dr. ${personShortName(doctor.first_name, doctor.last_name)}` : 'tu consultorio'
          const patientName = `${patient.first_name} ${patient.last_name}`
          
          await sendAppointmentReminder(patient.phone, patientName, docName, formattedDate)
          sentCount++
        }
      }
    }

    // Enviar recordatorios de 2 horas
    if (appts2h) {
      for (const app of appts2h) {
        const patient = app.patients as any
        const doctor = app.user_profiles as any
        
        if (patient?.phone) {
          const apptDate = new Date(app.scheduled_at)
          const formattedDate = `Hoy a las ${apptDate.toLocaleTimeString('es-HN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })}`

          const docName = doctor ? `Dr. ${personShortName(doctor.first_name, doctor.last_name)}` : 'tu consultorio'
          const patientName = `${patient.first_name} ${patient.last_name}`
          
          await sendAppointmentReminder(patient.phone, patientName, docName, formattedDate)
          sentCount++
        }
      }
    }

    return NextResponse.json({ success: true, reminders_sent: sentCount }, { status: 200 })
  } catch (error: any) {
    console.error('Error enviando recordatorios programados:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
