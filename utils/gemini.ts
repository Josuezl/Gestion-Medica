/**
 * Módulo de Integración con Google Gemini API
 * Utiliza llamadas REST directas para ligereza y robustez.
 */

interface GeminiChatResponse {
  reply: string
  intent: 'BOOK_APPOINTMENT' | 'CANCEL_APPOINTMENT' | 'ASK_INFO' | 'OTHER'
  extracted_date?: string // YYYY-MM-DD
  extracted_time?: string // HH:MM
  doctor_name?: string
  patient_name?: string
}

/**
 * Invoca a Gemini 2.5 Flash para procesar el mensaje del paciente en Honduras
 * y estructurar su intención clínica.
 */
export async function analyzePatientMessage(
  messageText: string,
  chatHistory: string,
  contextData: string
): Promise<GeminiChatResponse> {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey || apiKey.includes('placeholder')) {
    console.log('[Gemini Mock] Analizando mensaje:', messageText)
    return {
      reply: 'Hola. En este momento el asistente se encuentra en modo de prueba. Por favor, contacta directamente al consultorio para tu cita.',
      intent: 'OTHER'
    }
  }

  // System Prompt que define la personalidad y capacidades del bot de citas
  const systemInstruction = `
    Eres un asistente virtual de salud amigable y profesional para consultorios médicos en Honduras (MedConnect).
    Tu objetivo principal es ayudar a los pacientes a agendar citas, cancelar citas existentes o responder preguntas generales del consultorio.

    REGLAS CLAVE:
    1. Sé empático, claro y usa modismos respetuosos de Honduras (ej. saludar cordialmente con "Hola, buenos días/tardes").
    2. Si el paciente quiere agendar una cita, necesitas saber su nombre completo, fecha y hora preferida, y qué doctor o especialidad busca.
    3. Consulta la información en "CONTEXTO DISPONIBLE" para responder cuáles doctores y horarios están libres. No inventes disponibilidad.
    4. Siempre responde en formato JSON estructurado según el esquema solicitado.
  `

  const prompt = `
    INSTRUCCIÓN DE SISTEMA:
    ${systemInstruction}

    CONTEXTO DISPONIBLE DE LA CLÍNICA (Doctores, horarios y disponibilidad):
    ${contextData}

    HISTORIAL DE CHAT RECIENTE:
    ${chatHistory}

    MENSAJE ENTRANTE DEL PACIENTE:
    "${messageText}"
  `

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                reply: { 
                  type: 'STRING', 
                  description: 'La respuesta de texto conversacional y empática que se le enviará por WhatsApp al paciente.' 
                },
                intent: { 
                  type: 'STRING', 
                  enum: ['BOOK_APPOINTMENT', 'CANCEL_APPOINTMENT', 'ASK_INFO', 'OTHER'],
                  description: 'La intención detectada del paciente.' 
                },
                extracted_date: { 
                  type: 'STRING', 
                  description: 'Fecha extraída del mensaje del paciente en formato YYYY-MM-DD. Dejar vacío si no se menciona fecha.' 
                },
                extracted_time: { 
                  type: 'STRING', 
                  description: 'Hora extraída del mensaje en formato HH:MM (24 horas). Dejar vacío si no se menciona hora.' 
                },
                doctor_name: { 
                  type: 'STRING', 
                  description: 'Nombre o apellido del doctor mencionado por el paciente.' 
                },
                patient_name: { 
                  type: 'STRING', 
                  description: 'Nombre completo del paciente si se está registrando o si lo menciona para la cita.' 
                }
              },
              required: ['reply', 'intent'],
            },
          },
        }),
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      console.error('Error de API Gemini REST:', errText)
      throw new Error(`Gemini API error: ${response.statusText}`)
    }

    const result = await response.json()
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text

    if (!responseText) {
      throw new Error('Respuesta vacía de Gemini')
    }

    return JSON.parse(responseText) as GeminiChatResponse
  } catch (error) {
    console.error('Error analizando mensaje con Gemini:', error)
    return {
      reply: 'Disculpa los inconvenientes, tuvimos un problema al procesar tu solicitud. Por favor intenta de nuevo en unos minutos.',
      intent: 'OTHER'
    }
  }
}
