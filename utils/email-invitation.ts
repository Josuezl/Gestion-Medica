import { Resend } from 'resend'

const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Email de bienvenida con enlace seguro de un solo uso para fijar contraseña.
 * Se usa tanto al provisionar el dueño de una clínica (desde /superadmin) como al
 * invitar miembros de equipo (desde la configuración del org-admin).
 */
export async function sendSetPasswordEmail(params: {
  toEmail: string
  firstName: string
  clinicName: string
  role: string
  inviteLink: string
  inviterName?: string | null
}): Promise<{ success?: boolean; error?: string }> {
  const { toEmail, firstName, clinicName, role, inviteLink, inviterName } = params
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️ RESEND_API_KEY no configurada. Enlace de acceso (solo local):', inviteLink)
      return { success: true }
    }

    const resend = new Resend(process.env.RESEND_API_KEY)
    const roleEs = role === 'DOCTOR' ? 'Médico' : role === 'ASSISTANT' ? 'Asistente' : 'Administrador'
    const safeName = escapeHtml(firstName)
    const safeClinic = escapeHtml(clinicName)
    const invitedLine = inviterName
      ? `<p><strong>${escapeHtml(inviterName)}</strong> te ha dado acceso a <strong>${safeClinic}</strong>.</p>`
      : `<p>Se ha creado tu cuenta para <strong>${safeClinic}</strong>.</p>`

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="margin:0;padding:20px;background-color:#f8fafc;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#0f172a;">
        <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="background:#0d9488;color:#fff;padding:30px 20px;text-align:center;">
            <h1 style="margin:0;font-size:24px;font-weight:600;">CloudMedHN</h1>
          </div>
          <div style="padding:30px 20px;line-height:1.6;">
            <p>Hola ${safeName},</p>
            ${invitedLine}
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:15px;margin:20px 0;">
              <p style="margin:0;font-size:15px;"><strong>Rol asignado:</strong> ${roleEs}</p>
            </div>
            <p>Para activar tu cuenta, define tu contraseña haciendo clic en el botón:</p>
            <div style="text-align:center;margin:30px 0;">
              <a href="${inviteLink}" style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px;">Activar mi cuenta</a>
            </div>
            <p style="font-size:13px;color:#64748b;">Si no esperabas este correo, puedes ignorarlo. El enlace es de un solo uso y expira pronto.</p>
          </div>
          <div style="background:#f1f5f9;padding:20px;text-align:center;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">
            <p style="margin:0;">© ${new Date().getFullYear()} CloudMedHN. Documento confidencial.</p>
          </div>
        </div>
      </body>
      </html>
    `

    const { error } = await resend.emails.send({
      from: `CloudMedHN <${fromEmail}>`,
      to: [toEmail],
      subject: `Activa tu cuenta en ${clinicName} — CloudMedHN`,
      html: htmlContent,
    })

    if (error) {
      console.error('Error enviando email de acceso:', error)
      return { error: error.message }
    }
    return { success: true }
  } catch (error: any) {
    console.error('Excepción enviando email de acceso:', error)
    return { error: error.message }
  }
}

