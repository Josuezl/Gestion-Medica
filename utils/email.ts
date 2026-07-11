/**
 * Módulo de envío de correos con Resend
 * Documentación: https://resend.com/docs
 */

import { Resend } from 'resend'
import { medicineDetail } from './medicines'
import { errorMessage } from './errors'

const resend = new Resend(process.env.RESEND_API_KEY || 're_mock_123')

// Dirección "from" verificada en Resend.
// Si aún no tienes dominio verificado, Resend te da: onboarding@resend.dev
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Gestión Médica <onboarding@resend.dev>'

interface SendEmailResult {
  success: boolean
  id?: string
  error?: string
}

// Escapa datos del usuario antes de interpolarlos en el HTML del correo (anti-XSS/phishing).
function escapeHtml(value: string | null | undefined): string {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

  // Valores crudos para el subject (texto plano); el cuerpo HTML usa versiones escapadas.
  const subjectName = `${patientData.firstName} ${patientData.lastName}`
  const subjectClinic = clinicName

  clinicName = escapeHtml(clinicName)
  doctorName = escapeHtml(doctorName)
  patientData = {
    ...patientData,
    firstName: escapeHtml(patientData.firstName),
    lastName: escapeHtml(patientData.lastName),
    idCard: patientData.idCard ? escapeHtml(patientData.idCard) : patientData.idCard,
    phone: escapeHtml(patientData.phone),
    email: patientData.email ? escapeHtml(patientData.email) : patientData.email,
    bloodType: patientData.bloodType ? escapeHtml(patientData.bloodType) : patientData.bloodType,
    allergies: patientData.allergies ? escapeHtml(patientData.allergies) : patientData.allergies,
    pathologicalHistory: patientData.pathologicalHistory ? escapeHtml(patientData.pathologicalHistory) : patientData.pathologicalHistory,
    nonPathologicalHistory: patientData.nonPathologicalHistory ? escapeHtml(patientData.nonPathologicalHistory) : patientData.nonPathologicalHistory,
    familyHistory: patientData.familyHistory ? escapeHtml(patientData.familyHistory) : patientData.familyHistory,
  }

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
      subject: `Ficha Médica - ${subjectName} | ${subjectClinic}`,
      html,
    })

    if (error) {
      console.error('Error Resend (ficha médica):', error)
      return { success: false, error: error.message }
    }

    return { success: true, id: data?.id }
  } catch (err) {
    console.error('Error de red Resend:', err)
    return { success: false, error: errorMessage(err, 'Error de red al enviar correo') }
  }
}

/**
 * Envía la receta médica (con link al PDF) por correo electrónico
 */
export interface PrescriptionEmailData {
  toEmail: string
  clinicName: string
  clinicPhone?: string | null
  clinicAddress?: string | null
  doctorName: string
  doctorSpecialty?: string | null
  doctorProfessionalId?: string | null
  patientName: string
  patientAge: number
  patientGender?: string | null
  patientDni?: string | null
  isPediatric?: boolean
  date: string
  verificationCode: string
  pdfUrl: string
  pdfBase64?: string | null
  medicines: { name: string; dose?: string; frequency?: string; duration?: string }[]
  notes?: string | null
  signatureUrl?: string | null
  diagnosis?: string | null
}

export async function sendPrescriptionEmail(data: PrescriptionEmailData): Promise<SendEmailResult> {
  const toEmail = data.toEmail
  const pdfUrl = data.pdfUrl
  const pdfBase64 = data.pdfBase64
  const subjectClinic = data.clinicName
  const rawCode = data.verificationCode
  // Datos escapados para interpolar de forma segura en el HTML.
  const clinicName = escapeHtml(data.clinicName)
  const clinicPhone = escapeHtml(data.clinicPhone) || 'N/A'
  const clinicAddress = escapeHtml(data.clinicAddress) || 'Honduras'
  const doctorName = escapeHtml(data.doctorName)
  const doctorSpecialty = escapeHtml(data.doctorSpecialty) || 'Medicina General'
  const patientName = escapeHtml(data.patientName)
  const patientDni = escapeHtml(data.patientDni) || 'N/A'
  const patientAge = data.patientAge
  const genderText = data.patientGender === 'M' ? 'Masculino' : data.patientGender === 'F' ? 'Femenino' : 'Otro'
  const date = escapeHtml(data.date)
  const verificationCode = escapeHtml(data.verificationCode)
  const notes = data.notes ? escapeHtml(data.notes) : ''
  const diagnosis = data.diagnosis ? escapeHtml(data.diagnosis) : ''
  const signatureUrl = data.signatureUrl ? escapeHtml(data.signatureUrl) : ''
  const medicines = data.medicines.map((m) => ({
    name: escapeHtml(m.name),
    dose: m.dose ? escapeHtml(m.dose) : '',
    frequency: m.frequency ? escapeHtml(m.frequency) : '',
    duration: m.duration ? escapeHtml(m.duration) : '',
  }))

  const medsHtml = medicines.map((med, i) => {
    const det = escapeHtml(medicineDetail(med))
    return `
    <tr>
      <td style="padding:8px 0; border-bottom:1px solid #f1f5f9; font-size:14px; color:#0f172a; vertical-align:top;"><strong>${i + 1}. ${escapeHtml(med.name)}</strong>${det ? ` <span style="font-weight:400; color:#475569;">— ${det}</span>` : ''}</td>
    </tr>`
  }).join('')

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background-color:#e2e8f0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color:#0f172a;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#e2e8f0; padding:32px 16px;">
        <tr>
          <td align="center">
            <table width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 8px 30px rgba(15,23,42,0.12);">

              <!-- Encabezado centrado: organización + médico -->
              <tr>
                <td style="padding:28px 36px 0; text-align:center;">
                  <h1 style="margin:0; font-size:24px; font-weight:800; color:#0f172a; letter-spacing:-0.01em;">${clinicName}</h1>
                  <p style="margin:4px 0 0; font-size:12px; color:#64748b;">Tel: ${clinicPhone} &nbsp;&bull;&nbsp; ${clinicAddress}</p>
                  <p style="margin:10px 0 0; font-size:16px; font-weight:700; color:#0f172a;">${doctorName}</p>
                  <p style="margin:2px 0 0; font-size:12px; font-weight:600; color:#0d9488;">${doctorSpecialty}</p>
                </td>
              </tr>

              <tr><td style="padding:14px 36px 0;"><div style="height:1px; background:#e2e8f0; line-height:1px;">&nbsp;</div></td></tr>

              <!-- Paciente -->
              <tr>
                <td style="padding:14px 36px 0;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border:1px solid #e9eef4; border-radius:8px;">
                    <tr>
                      <td style="padding:12px 16px;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="vertical-align:top;">
                              <span style="font-size:9px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em;">Paciente</span><br>
                              <span style="font-size:14px; font-weight:700; color:#1e293b;">${patientName}${data.isPediatric ? ' <span style="font-size:9px; background:#ccfbf1; color:#0d9488; padding:1px 7px; border-radius:4px; font-weight:700;">PEDIÁTRICO</span>' : ''}</span>
                            </td>
                            <td style="vertical-align:top; text-align:right;">
                              <span style="font-size:9px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em;">Fecha de emisión</span><br>
                              <span style="font-size:12px; font-weight:600; color:#1e293b;">${date}</span>
                            </td>
                          </tr>
                        </table>
                        <div style="margin-top:8px;">
                          <span style="font-size:9px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em;">Edad / Sexo / Identidad</span><br>
                          <span style="font-size:12px; font-weight:600; color:#1e293b;">${patientAge} años &nbsp;&bull;&nbsp; ${genderText} &nbsp;&bull;&nbsp; DNI: ${patientDni}</span>
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              ${diagnosis ? `
              <!-- Diagnóstico (opcional) -->
              <tr>
                <td style="padding:14px 36px 0;">
                  <span style="font-size:9px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em;">Diagnóstico</span><br>
                  <span style="font-size:13px; font-weight:600; color:#1e293b;">${diagnosis}</span>
                  <div style="border-bottom:1px solid #e2e8f0; margin-top:12px;"></div>
                </td>
              </tr>` : ''}

              <!-- Rp. Prescripción -->
              <tr>
                <td style="padding:18px 36px 0;">
                  <p style="margin:0 0 6px; font-size:18px; font-weight:800; font-style:italic; color:#0d9488;">Rp. <span style="font-style:normal; font-size:12px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.05em;">Prescripción Médica</span></p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <th style="text-align:left; font-size:9px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid #e2e8f0; padding:0 0 4px;">Medicamento</th>
                    </tr>
                    ${medsHtml}
                  </table>
                </td>
              </tr>

              ${notes ? `
              <!-- Indicaciones generales -->
              <tr>
                <td style="padding:14px 36px 0;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb; border:1px solid #fde68a; border-left:3px solid #f59e0b; border-radius:6px;">
                    <tr>
                      <td style="padding:10px 14px;">
                        <span style="font-size:9px; color:#92400e; text-transform:uppercase; font-weight:700; letter-spacing:0.04em;">Indicaciones generales</span><br>
                        <span style="font-size:13px; color:#78350f; line-height:1.5; white-space:pre-line;">${notes}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              ` : ''}

              <!-- Código de verificación + PDF -->
              <tr>
                <td style="padding:18px 36px 0; text-align:center;">
                  <table cellpadding="0" cellspacing="0" align="center" style="background-color:#f0fdfa; border:1px solid #ccfbf1; border-radius:8px;">
                    <tr>
                      <td style="padding:10px 22px; text-align:center;">
                        <span style="font-size:10px; color:#0d9488; text-transform:uppercase; font-weight:600;">Código de Verificación</span><br>
                        <span style="font-size:20px; color:#0f766e; font-weight:800; letter-spacing:0.15em;">${verificationCode}</span>
                      </td>
                    </tr>
                  </table>
                  <div style="margin-top:14px;">
                    <a href="${pdfUrl}" target="_blank" style="display:inline-block; padding:12px 28px; background:#0d9488; color:#ffffff; text-decoration:none; border-radius:8px; font-size:14px; font-weight:700;">📄 Descargar Receta en PDF</a>
                  </div>
                </td>
              </tr>

              <!-- Firma -->
              <tr>
                <td style="padding:26px 36px 0; text-align:center;">
                  ${signatureUrl ? `<div style="margin-bottom:2px;"><img src="${signatureUrl}" alt="Firma y sello" style="max-height:96px; max-width:280px; object-fit:contain;" /></div>` : ''}
                  <div style="display:inline-block; border-top:1px solid #334155; padding-top:4px; min-width:220px;">
                    <p style="margin:0; font-size:13px; font-weight:700; color:#0f172a;">${doctorName}</p>
                    <p style="margin:1px 0 0; font-size:10px; color:#475569;">${doctorSpecialty}</p>
                  </div>
                </td>
              </tr>

              <!-- Pie -->
              <tr>
                <td style="padding:24px 36px 28px;">
                  <p style="margin:0; color:#94a3b8; font-size:11px; text-align:center; line-height:1.5;">
                    Este correo fue enviado desde ${clinicName} mediante el sistema CloudMedHN.<br>
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
      subject: `Receta Médica - ${rawCode} | ${subjectClinic}`,
      html,
      ...(pdfBase64
        ? { attachments: [{ filename: `Receta-${rawCode}.pdf`, content: pdfBase64 }] }
        : {}),
    })

    if (error) {
      console.error('Error Resend (receta):', error)
      return { success: false, error: error.message }
    }

    return { success: true, id: data?.id }
  } catch (err) {
    console.error('Error de red Resend:', err)
    return { success: false, error: errorMessage(err, 'Error de red al enviar correo') }
  }
}

/**
 * Correo genérico para compartir un documento (orden de laboratorio / incapacidad) con el paciente.
 * A diferencia de la receta, NO adjunta PDF: envía el enlace público verificable (/verificar/{código}),
 * el mismo destino del QR impreso, por lo que el paciente ve el documento auténtico sin iniciar sesión.
 */
export interface DocumentLinkEmailData {
  toEmail: string
  subject: string
  docTitle: string                 // "Orden de Laboratorio" | "Incapacidad Médica"
  clinicName: string
  clinicPhone?: string | null
  clinicAddress?: string | null
  doctorName: string
  doctorSpecialty?: string | null
  patientName: string
  date: string
  verificationCode: string
  verifyUrl: string
  // Bloque(s) de detalle del documento (exámenes solicitados / texto de la incapacidad).
  summary?: { label: string; value: string }[]
}

export async function sendDocumentLinkEmail(data: DocumentLinkEmailData): Promise<SendEmailResult> {
  const toEmail = data.toEmail
  const subject = data.subject
  // Datos escapados para interpolar de forma segura en el HTML.
  const docTitle = escapeHtml(data.docTitle)
  const clinicNameRaw = data.clinicName
  const clinicName = escapeHtml(data.clinicName)
  const clinicPhone = escapeHtml(data.clinicPhone) || 'N/A'
  const clinicAddress = escapeHtml(data.clinicAddress) || 'Honduras'
  const doctorName = escapeHtml(data.doctorName)
  const doctorSpecialty = escapeHtml(data.doctorSpecialty) || 'Medicina General'
  const patientName = escapeHtml(data.patientName)
  const date = escapeHtml(data.date)
  const verificationCode = escapeHtml(data.verificationCode)
  const verifyUrl = data.verifyUrl

  const summaryHtml = (data.summary || [])
    .filter((s) => s.value && String(s.value).trim() !== '')
    .map((s) => `
      <div style="margin-top:10px;">
        <span style="font-size:9px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em;">${escapeHtml(s.label)}</span><br>
        <span style="font-size:13px; font-weight:600; color:#1e293b; line-height:1.5; white-space:pre-line;">${escapeHtml(s.value)}</span>
      </div>`)
    .join('')

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background-color:#e2e8f0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color:#0f172a;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#e2e8f0; padding:32px 16px;">
        <tr>
          <td align="center">
            <table width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 8px 30px rgba(15,23,42,0.12);">

              <!-- Encabezado: organización + médico -->
              <tr>
                <td style="padding:28px 36px 0; text-align:center;">
                  <h1 style="margin:0; font-size:24px; font-weight:800; color:#0f172a; letter-spacing:-0.01em;">${clinicName}</h1>
                  <p style="margin:4px 0 0; font-size:12px; color:#64748b;">Tel: ${clinicPhone} &nbsp;&bull;&nbsp; ${clinicAddress}</p>
                  <p style="margin:10px 0 0; font-size:16px; font-weight:700; color:#0f172a;">${doctorName}</p>
                  <p style="margin:2px 0 0; font-size:12px; font-weight:600; color:#0d9488;">${doctorSpecialty}</p>
                </td>
              </tr>

              <tr><td style="padding:14px 36px 0;"><p style="margin:0; text-align:center; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.12em; color:#0d9488;">${docTitle}</p></td></tr>
              <tr><td style="padding:10px 36px 0;"><div style="height:1px; background:#e2e8f0; line-height:1px;">&nbsp;</div></td></tr>

              <!-- Paciente + detalle -->
              <tr>
                <td style="padding:14px 36px 0;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border:1px solid #e9eef4; border-radius:8px;">
                    <tr>
                      <td style="padding:12px 16px;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="vertical-align:top;">
                              <span style="font-size:9px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em;">Paciente</span><br>
                              <span style="font-size:14px; font-weight:700; color:#1e293b;">${patientName}</span>
                            </td>
                            <td style="vertical-align:top; text-align:right;">
                              <span style="font-size:9px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em;">Fecha</span><br>
                              <span style="font-size:12px; font-weight:600; color:#1e293b;">${date}</span>
                            </td>
                          </tr>
                        </table>
                        ${summaryHtml}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Código + botón verificable -->
              <tr>
                <td style="padding:18px 36px 0; text-align:center;">
                  <table cellpadding="0" cellspacing="0" align="center" style="background-color:#f0fdfa; border:1px solid #ccfbf1; border-radius:8px;">
                    <tr>
                      <td style="padding:10px 22px; text-align:center;">
                        <span style="font-size:10px; color:#0d9488; text-transform:uppercase; font-weight:600;">Código de Verificación</span><br>
                        <span style="font-size:20px; color:#0f766e; font-weight:800; letter-spacing:0.15em;">${verificationCode}</span>
                      </td>
                    </tr>
                  </table>
                  <div style="margin-top:14px;">
                    <a href="${verifyUrl}" target="_blank" style="display:inline-block; padding:12px 28px; background:#0d9488; color:#ffffff; text-decoration:none; border-radius:8px; font-size:14px; font-weight:700;">🔎 Ver documento verificado</a>
                  </div>
                </td>
              </tr>

              <!-- Pie -->
              <tr>
                <td style="padding:26px 36px 28px;">
                  <p style="margin:0; color:#94a3b8; font-size:11px; text-align:center; line-height:1.5;">
                    Este correo fue enviado desde ${clinicName} mediante el sistema CloudMedHN.<br>
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
    console.warn(`⚠️ RESEND_API_KEY no configurada. Simulación de envío exitoso de ${clinicNameRaw} (${data.docTitle}).`)
    return { success: true, id: 'mock_send_id' }
  }

  try {
    const { data: sent, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [toEmail],
      subject,
      html,
    })

    if (error) {
      console.error('Error Resend (documento):', error)
      return { success: false, error: error.message }
    }

    return { success: true, id: sent?.id }
  } catch (err) {
    console.error('Error de red Resend:', err)
    return { success: false, error: errorMessage(err, 'Error de red al enviar correo') }
  }
}

/**
 * Envía al equipo técnico el reporte de un error de cliente (fallo de guardado con internet).
 * El HTML ya viene armado y escapado por utils/clientErrorReport.ts. Sin PHI del paciente.
 */
export async function sendClientErrorReportEmail(subject: string, html: string): Promise<SendEmailResult> {
  const to = process.env.ERROR_REPORT_EMAIL || 'Josuez@outlook.com'

  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️ RESEND_API_KEY no configurada. Simulación de envío de reporte de error de cliente.')
    return { success: true, id: 'mock_send_id' }
  }

  try {
    const { data: sent, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    })

    if (error) {
      console.error('Error Resend (reporte de error de cliente):', error)
      return { success: false, error: error.message }
    }

    return { success: true, id: sent?.id }
  } catch (err) {
    console.error('Error de red Resend (reporte de error de cliente):', err)
    return { success: false, error: errorMessage(err, 'Error de red al enviar correo') }
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
