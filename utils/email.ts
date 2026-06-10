/**
 * Módulo de envío de correos con Resend
 * Documentación: https://resend.com/docs
 */

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY || 're_mock_123')

// Dirección "from" verificada en Resend.
// Si aún no tienes dominio verificado, Resend te da: onboarding@resend.dev
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Gestión Médica <onboarding@resend.dev>'

interface SendEmailResult {
  success: boolean
  id?: string
  error?: string
}

/**
 * Envía la ficha médica completa del paciente por correo electrónico
 */
export async function sendMedicalRecordEmail(
  toEmail: string,
  patientData: {
    firstName: string
    lastName: string
    idCard: string | null
    birthDate: string
    gender: string
    phone: string
    email: string | null
    bloodType: string | null
    allergies: string | null
    pathologicalHistory: string | null
    nonPathologicalHistory: string | null
    familyHistory: string | null
  },
  clinicName: string,
  doctorName: string
): Promise<SendEmailResult> {
  const age = calculateAge(patientData.birthDate)
  const genderText = patientData.gender === 'M' ? 'Masculino' : patientData.gender === 'F' ? 'Femenino' : 'Otro'

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background-color:#f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9; padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #0d9488, #0f766e); padding:32px 40px;">
                  <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:700;">📋 Ficha Médica</h1>
                  <p style="margin:8px 0 0; color:rgba(255,255,255,0.85); font-size:14px;">${clinicName} • ${doctorName}</p>
                </td>
              </tr>

              <!-- Patient Info -->
              <tr>
                <td style="padding:32px 40px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding-bottom:20px;">
                        <h2 style="margin:0 0 4px; color:#0f172a; font-size:22px;">${patientData.firstName} ${patientData.lastName}</h2>
                        <p style="margin:0; color:#64748b; font-size:14px;">${age} años • ${genderText}</p>
                      </td>
                    </tr>
                  </table>

                  <!-- Data Grid -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc; border-radius:8px; border:1px solid #e2e8f0;">
                    <tr>
                      <td style="padding:16px 20px; border-bottom:1px solid #e2e8f0;" width="50%">
                        <span style="font-size:11px; color:#94a3b8; text-transform:uppercase; font-weight:600; letter-spacing:0.05em;">Identidad (DNI)</span><br>
                        <span style="font-size:15px; color:#0f172a; font-weight:600;">${patientData.idCard || 'N/A'}</span>
                      </td>
                      <td style="padding:16px 20px; border-bottom:1px solid #e2e8f0;" width="50%">
                        <span style="font-size:11px; color:#94a3b8; text-transform:uppercase; font-weight:600; letter-spacing:0.05em;">Tipo de Sangre</span><br>
                        <span style="font-size:15px; color:#dc2626; font-weight:700;">${patientData.bloodType || 'N/A'}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:16px 20px; border-bottom:1px solid #e2e8f0;">
                        <span style="font-size:11px; color:#94a3b8; text-transform:uppercase; font-weight:600; letter-spacing:0.05em;">Teléfono</span><br>
                        <span style="font-size:15px; color:#0f172a;">${patientData.phone}</span>
                      </td>
                      <td style="padding:16px 20px; border-bottom:1px solid #e2e8f0;">
                        <span style="font-size:11px; color:#94a3b8; text-transform:uppercase; font-weight:600; letter-spacing:0.05em;">Correo</span><br>
                        <span style="font-size:15px; color:#0f172a;">${patientData.email || 'N/A'}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Allergies Alert -->
              <tr>
                <td style="padding:0 40px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2; border:1px solid #fecaca; border-radius:8px; border-left:4px solid #ef4444;">
                    <tr>
                      <td style="padding:16px 20px;">
                        <span style="font-size:11px; color:#dc2626; text-transform:uppercase; font-weight:700; letter-spacing:0.05em;">⚠️ Alergias</span><br>
                        <span style="font-size:15px; color:#991b1b; font-weight:600;">${patientData.allergies || 'Ninguna conocida'}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- History Sections -->
              <tr>
                <td style="padding:0 40px 24px;">
                  <h3 style="margin:0 0 12px; color:#0d9488; font-size:16px; border-bottom:2px solid #0d9488; padding-bottom:8px;">Antecedentes Patológicos</h3>
                  <p style="margin:0; color:#334155; font-size:14px; line-height:1.6; white-space:pre-line;">${patientData.pathologicalHistory || 'No declarados'}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 40px 24px;">
                  <h3 style="margin:0 0 12px; color:#0d9488; font-size:16px; border-bottom:2px solid #0d9488; padding-bottom:8px;">Antecedentes No Patológicos</h3>
                  <p style="margin:0; color:#334155; font-size:14px; line-height:1.6; white-space:pre-line;">${patientData.nonPathologicalHistory || 'No declarados'}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 40px 32px;">
                  <h3 style="margin:0 0 12px; color:#0d9488; font-size:16px; border-bottom:2px solid #0d9488; padding-bottom:8px;">Antecedentes Heredofamiliares</h3>
                  <p style="margin:0; color:#334155; font-size:14px; line-height:1.6; white-space:pre-line;">${patientData.familyHistory || 'No declarados'}</p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color:#f8fafc; padding:20px 40px; border-top:1px solid #e2e8f0;">
                  <p style="margin:0; color:#94a3b8; font-size:12px; text-align:center;">
                    Este correo fue enviado desde ${clinicName} mediante el sistema de Gestión Médica.<br>
                    Documento confidencial — uso exclusivo del paciente y personal médico autorizado.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️ RESEND_API_KEY no configurada. Simulación de envío exitoso de Ficha Médica.')
    return { success: true, id: 'mock_send_id' }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [toEmail],
      subject: `Ficha Médica - ${patientData.firstName} ${patientData.lastName} | ${clinicName}`,
      html,
    })

    if (error) {
      console.error('Error Resend (ficha médica):', error)
      return { success: false, error: error.message }
    }

    return { success: true, id: data?.id }
  } catch (err: any) {
    console.error('Error de red Resend:', err)
    return { success: false, error: err.message || 'Error de red al enviar correo' }
  }
}

/**
 * Envía la receta médica (con link al PDF) por correo electrónico
 */
export async function sendPrescriptionEmail(
  toEmail: string,
  patientName: string,
  doctorName: string,
  clinicName: string,
  verificationCode: string,
  pdfUrl: string,
  medicines: { name: string; dose?: string; frequency?: string; duration?: string }[],
  notes?: string
): Promise<SendEmailResult> {
  const medsHtml = medicines.map((med, i) => `
    <tr>
      <td style="padding:10px 16px; border-bottom:1px solid #e2e8f0; font-size:14px; color:#0f172a; font-weight:600;">${i + 1}. ${med.name}</td>
      <td style="padding:10px 16px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#64748b;">${med.dose || ''}</td>
      <td style="padding:10px 16px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#64748b;">${med.frequency || ''}</td>
      <td style="padding:10px 16px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#64748b;">${med.duration || ''}</td>
    </tr>
  `).join('')

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background-color:#f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9; padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #0d9488, #0f766e); padding:32px 40px;">
                  <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:700;">💊 Receta Médica Digital</h1>
                  <p style="margin:8px 0 0; color:rgba(255,255,255,0.85); font-size:14px;">${clinicName} • ${doctorName}</p>
                </td>
              </tr>

              <!-- Greeting -->
              <tr>
                <td style="padding:32px 40px 16px;">
                  <p style="margin:0; color:#334155; font-size:16px; line-height:1.6;">
                    Hola <strong>${patientName}</strong>,<br><br>
                    Se te ha emitido una receta médica digital. A continuación encontrarás el detalle de los medicamentos prescritos.
                  </p>
                </td>
              </tr>

              <!-- Medicines Table -->
              <tr>
                <td style="padding:16px 40px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
                    <tr style="background-color:#f0fdfa;">
                      <th style="padding:10px 16px; text-align:left; font-size:12px; color:#0d9488; text-transform:uppercase; font-weight:700; letter-spacing:0.05em;">Medicamento</th>
                      <th style="padding:10px 16px; text-align:left; font-size:12px; color:#0d9488; text-transform:uppercase; font-weight:700; letter-spacing:0.05em;">Dosis</th>
                      <th style="padding:10px 16px; text-align:left; font-size:12px; color:#0d9488; text-transform:uppercase; font-weight:700; letter-spacing:0.05em;">Frecuencia</th>
                      <th style="padding:10px 16px; text-align:left; font-size:12px; color:#0d9488; text-transform:uppercase; font-weight:700; letter-spacing:0.05em;">Duración</th>
                    </tr>
                    ${medsHtml}
                  </table>
                </td>
              </tr>

              ${notes ? `
              <!-- Notes -->
              <tr>
                <td style="padding:0 40px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb; border:1px solid #fde68a; border-radius:8px; border-left:4px solid #f59e0b;">
                    <tr>
                      <td style="padding:16px 20px;">
                        <span style="font-size:11px; color:#92400e; text-transform:uppercase; font-weight:700;">📝 Indicaciones Adicionales</span><br>
                        <span style="font-size:14px; color:#78350f; line-height:1.6; white-space:pre-line;">${notes}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              ` : ''}

              <!-- Download Button -->
              <tr>
                <td style="padding:0 40px 24px;" align="center">
                  <a href="${pdfUrl}" target="_blank" style="display:inline-block; padding:14px 32px; background:linear-gradient(135deg, #0d9488, #0f766e); color:#ffffff; text-decoration:none; border-radius:8px; font-size:15px; font-weight:700; letter-spacing:0.02em;">
                    📄 Descargar Receta en PDF
                  </a>
                </td>
              </tr>

              <!-- Verification Code -->
              <tr>
                <td style="padding:0 40px 32px;" align="center">
                  <table cellpadding="0" cellspacing="0" style="background-color:#f0fdfa; border:1px solid #ccfbf1; border-radius:8px;">
                    <tr>
                      <td style="padding:12px 24px; text-align:center;">
                        <span style="font-size:11px; color:#0d9488; text-transform:uppercase; font-weight:600;">Código de Verificación</span><br>
                        <span style="font-size:20px; color:#0f766e; font-weight:800; letter-spacing:0.15em;">${verificationCode}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color:#f8fafc; padding:20px 40px; border-top:1px solid #e2e8f0;">
                  <p style="margin:0; color:#94a3b8; font-size:12px; text-align:center;">
                    Este correo fue enviado desde ${clinicName} mediante el sistema de Gestión Médica.<br>
                    Documento confidencial — uso exclusivo del paciente y personal médico autorizado.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️ RESEND_API_KEY no configurada. Simulación de envío exitoso de Receta Médica.')
    return { success: true, id: 'mock_send_id' }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [toEmail],
      subject: `Receta Médica - ${verificationCode} | ${clinicName}`,
      html,
    })

    if (error) {
      console.error('Error Resend (receta):', error)
      return { success: false, error: error.message }
    }

    return { success: true, id: data?.id }
  } catch (err: any) {
    console.error('Error de red Resend:', err)
    return { success: false, error: err.message || 'Error de red al enviar correo' }
  }
}

function calculateAge(birthDateString: string): number {
  const today = new Date()
  const birthDate = new Date(birthDateString)
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
  return age
}
