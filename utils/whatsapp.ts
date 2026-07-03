/**
 * Módulo de Integración con WhatsApp Business Cloud API (Meta)
 * Soporta Honduras (+504)
 */

interface WhatsAppResponse {
  success: boolean
  messageId?: string
  error?: string
}

/** Componente de plantilla de la Cloud API de Meta (body/header/button con sus parámetros). */
interface WhatsAppTemplateComponent {
  type: string
  parameters: { type: string; text?: string }[]
}

/**
 * Envia un mensaje utilizando plantillas oficiales de Meta (WhatsApp Business API)
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string = 'es',
  components: WhatsAppTemplateComponent[] = []
): Promise<WhatsAppResponse> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  // Validar si los tokens son de prueba/placeholders
  if (!phoneId || !accessToken || accessToken.includes('placeholder') || phoneId === '1234567890') {
    console.log(`[WhatsApp Mock] Enviando plantilla "${templateName}" a ${to} con componentes:`, JSON.stringify(components, null, 2))
    return { success: true, messageId: `mock_${Date.now()}` }
  }

  const cleanPhone = to.replace('+', '') // Meta requiere número sin el símbolo +

  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: languageCode,
          },
          components,
        },
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Error de WhatsApp Business API:', data)
      return { success: false, error: data.error?.message || 'Error desconocido al enviar plantilla' }
    }

    return { success: true, messageId: data.messages?.[0]?.id }
  } catch (error) {
    console.error('Error de conexión con WhatsApp API:', error)
    return { success: false, error: error instanceof Error && error.message ? error.message : 'Error de red' }
  }
}

/**
 * Envía la receta médica digital en PDF al paciente
 */
export async function sendPrescriptionNotification(
  to: string,
  patientName: string,
  doctorName: string,
  pdfUrl: string,
  code: string
): Promise<WhatsAppResponse> {
  // Configuración de los parámetros de la plantilla de WhatsApp aprobada por Meta
  // Parámetros comunes:
  // {{1}} = Nombre del Paciente
  // {{2}} = Nombre del Doctor
  // {{3}} = Link temporal de descarga del PDF de la receta
  // {{4}} = Código de validación
  
  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: patientName },
        { type: 'text', text: doctorName },
        { type: 'text', text: pdfUrl },
        { type: 'text', text: code },
      ],
    },
  ]

  return sendWhatsAppTemplate(to, 'receta_digital', 'es', components)
}

/**
 * Envía un recordatorio de cita médica al paciente
 */
export async function sendAppointmentReminder(
  to: string,
  patientName: string,
  doctorName: string,
  dateTimeFormatted: string
): Promise<WhatsAppResponse> {
  // Parámetros comunes:
  // {{1}} = Nombre del Paciente
  // {{2}} = Nombre del Doctor o Clínica
  // {{3}} = Fecha y hora formateada (Ej. Jueves 15 de Octubre a las 3:00 PM)
  
  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: patientName },
        { type: 'text', text: doctorName },
        { type: 'text', text: dateTimeFormatted },
      ],
    },
  ]

  return sendWhatsAppTemplate(to, 'recordatorio_cita', 'es', components)
}
