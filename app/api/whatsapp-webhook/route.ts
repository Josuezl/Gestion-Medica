import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { analyzePatientMessage } from '@/utils/gemini'

// Utilidad para enviar mensaje de WhatsApp mediante Meta Graph API
async function sendWhatsAppMessage(to: string, text: string) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneId || !accessToken || accessToken.includes('placeholder') || phoneId === '1234567890') {
    console.log(`[WhatsApp Bot Reply Mock] Enviando a ${to}: "${text}"`)
    return
  }

  const cleanPhone = to.replace('+', '')

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: text,
        },
      }),
    })

    if (!res.ok) {
      console.error('Error enviando mensaje de WhatsApp:', await res.json())
    }
  } catch (err) {
    console.error('Error de red en WhatsApp Send:', err)
  }
}

// 1. GET: Verificación del Webhook por Meta
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('Webhook de WhatsApp verificado exitosamente.')
    return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse('Error de verificación', { status: 403 })
}

// 2. POST: Procesamiento de Mensajes Entrantes de Pacientes
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('Advertencia: Variables de entorno de Supabase no configuradas durante la compilación.')
    return NextResponse.json({ success: false, error: 'Credenciales de Supabase no configuradas.' }, { status: 200 })
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const body = await request.json()

    // Validar estructura de Meta Webhook
    const entry = body.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value
    const message = value?.messages?.[0]

    if (!message || message.type !== 'text') {
      // Retornar 200 a Meta inmediatamente para evitar reintentos si no es un mensaje de texto
      return NextResponse.json({ status: 'ignored' }, { status: 200 })
    }

    const patientRawPhone = message.from // E.g. "50499887766"
    const patientPhone = `+${patientRawPhone}`
    const messageText = message.text.body

    console.log(`[WhatsApp Webhook] Mensaje recibido de ${patientPhone}: "${messageText}"`)

    // 1. Buscar si el paciente ya está registrado en Honduras (+504)
    let { data: patient } = await supabaseAdmin
      .from('patients')
      .select('*')
      .eq('phone', patientPhone)
      .limit(1)
      .maybeSingle()

    // 2. Si no hay clínica, obtener la primera clínica registrada de la DB por defecto
    let clinicId = patient?.clinic_id
    if (!clinicId) {
      const { data: firstClinic } = await supabaseAdmin
        .from('clinics')
        .select('id')
        .limit(1)
        .single()
      clinicId = firstClinic?.id
    }

    if (!clinicId) {
      // Si no hay ninguna clínica configurada en la plataforma, responder error
      await sendWhatsAppMessage(patientPhone, 'Hola. El consultorio aún no está configurado en el sistema. Por favor intenta más tarde.')
      return NextResponse.json({ status: 'no_clinics' }, { status: 200 })
    }

    // 3. Obtener el listado de médicos de la clínica para contextualizar a la IA
    const { data: doctors } = await supabaseAdmin
      .from('user_profiles')
      .select('id, first_name, last_name, specialty')
      .eq('clinic_id', clinicId)
      .eq('role', 'DOCTOR')

    // 4. Obtener las citas de los próximos 7 días para validar disponibilidad
    const today = new Date()
    const in7Days = new Date()
    in7Days.setDate(today.getDate() + 7)

    const { data: appointments } = await supabaseAdmin
      .from('appointments')
      .select('scheduled_at, doctor_id, user_profiles(first_name, last_name)')
      .eq('clinic_id', clinicId)
      .gte('scheduled_at', today.toISOString())
      .lte('scheduled_at', in7Days.toISOString())
      .neq('status', 'CANCELLED') // Ignorar citas canceladas

    // 5. Construir contexto clínico
    const contextData = `
      Clínica ID: ${clinicId}
      Huso Horario: Honduras (America/Tegucigalpa, GMT-6)
      Fecha/Hora Actual del Servidor: ${new Date().toLocaleString('es-HN')}
      
      MÉDICOS DISPONIBLES EN ESTA CLÍNICA:
      ${doctors?.map(d => `- Dr. ${d.first_name} ${d.last_name} (Especialidad: ${d.specialty || 'General'}) [ID: ${d.id}]`).join('\n') || 'No hay doctores registrados.'}

      CITAS YA AGENDADAS (NO DISPONIBLES) EN LOS PRÓXIMOS 7 DÍAS:
      ${appointments?.map(a => `- ${new Date(a.scheduled_at).toLocaleString('es-HN')} con Dr. ${(a.user_profiles as any)?.first_name} ${(a.user_profiles as any)?.last_name}`).join('\n') || 'No hay citas ocupadas en este rango.'}
    `

    // Historial básico (para simplicidad de este webhook serverless)
    const chatHistory = `Paciente: ${messageText}`

    // 6. Analizar mensaje con Google Gemini
    const aiResult = await analyzePatientMessage(messageText, chatHistory, contextData)
    console.log('[Gemini Bot Result]:', JSON.stringify(aiResult, null, 2))

    // 7. Si la intención es agendar cita y tenemos los datos estructurados
    if (aiResult.intent === 'BOOK_APPOINTMENT' && aiResult.extracted_date && aiResult.extracted_time) {
      
      // 7.1 Si el paciente no está registrado, crearlo automáticamente con ficha básica
      if (!patient) {
        const rawName = aiResult.patient_name || 'Paciente Nuevo'
        const nameParts = rawName.split(' ')
        const firstName = nameParts[0] || 'Paciente'
        const lastName = nameParts.slice(1).join(' ') || 'Registrado por Bot'

        const { data: newPatient, error: regError } = await supabaseAdmin
          .from('patients')
          .insert([{
            clinic_id: clinicId,
            first_name: firstName,
            last_name: lastName,
            phone: patientPhone,
            birth_date: '2000-01-01', // Ficha temporal por defecto
            allergies: 'Ninguna conocida'
          }])
          .select()
          .single()

        if (regError) {
          console.error('Error auto-registrando paciente desde bot:', regError)
        } else {
          patient = newPatient
        }
      }

      // 7.2 Determinar a qué doctor corresponde la cita
      let doctorId = doctors?.[0]?.id // Fallback al primer médico
      if (aiResult.doctor_name && doctors) {
        const docNameLower = aiResult.doctor_name.toLowerCase()
        const matchedDoc = doctors.find(
          d => d.first_name.toLowerCase().includes(docNameLower) || d.last_name.toLowerCase().includes(docNameLower)
        )
        if (matchedDoc) {
          doctorId = matchedDoc.id
        }
      }

      if (patient && doctorId) {
        const appointmentDate = new Date(`${aiResult.extracted_date}T${aiResult.extracted_time}:00`).toISOString()
        
        // Registrar la cita
        const { error: apptError } = await supabaseAdmin
          .from('appointments')
          .insert([{
            clinic_id: clinicId,
            patient_id: patient.id,
            doctor_id: doctorId,
            scheduled_at: appointmentDate,
            status: 'PENDING', // Requiere confirmación/vista por el doctor
            notes: 'Cita reservada automáticamente por el asistente de IA en WhatsApp.'
          }])

        if (apptError) {
          console.error('Error insertando cita por bot:', apptError)
          await sendWhatsAppMessage(patientPhone, 'Tuvimos un problema técnico al agendar tu cita en el sistema. Por favor, intenta de nuevo o comunícate al consultorio.')
          return NextResponse.json({ status: 'appt_insert_failed' }, { status: 200 })
        }
      }
    }

    // 8. Enviar la respuesta generada por la IA
    await sendWhatsAppMessage(patientPhone, aiResult.reply)

    return NextResponse.json({ status: 'success' }, { status: 200 })
  } catch (error) {
    console.error('Error crítico en webhook de WhatsApp:', error)
    return NextResponse.json({ status: 'error', error: 'Internal Server Error' }, { status: 500 })
  }
}
