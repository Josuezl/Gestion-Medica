import { Resend } from 'resend'
import { errorMessage } from './errors'

// Debe venir en formato "Nombre <correo>" (igual que utils/email.ts)
const fromEmail = process.env.RESEND_FROM_EMAIL || 'CloudMedHN <onboarding@resend.dev>'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Email con enlace de un solo uso para restablecer la contraseña.
 */
export async function sendPasswordResetEmail(params: {
  toEmail: string
  firstName: string
  resetLink: string
}): Promise<{ success?: boolean; error?: string }> {
  const { toEmail, firstName, resetLink } = params
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️ RESEND_API_KEY no configurada. Enlace de reinicio (solo local):', resetLink)
      return { success: true }
    }

    const resend = new Resend(process.env.RESEND_API_KEY)
    const safeName = escapeHtml(firstName)

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
            <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
            <div style="text-align:center;margin:30px 0;">
              <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px;">Restablecer mi contraseña</a>
            </div>
            <p style="font-size:13px;color:#64748b;">Si no solicitaste este cambio, ignora este correo: tu contraseña actual seguirá funcionando. El enlace es de un solo uso y expira pronto.</p>
          </div>
          <div style="background:#f1f5f9;padding:20px;text-align:center;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">
            <p style="margin:0;">© ${new Date().getFullYear()} CloudMedHN. Documento confidencial.</p>
          </div>
        </div>
      </body>
      </html>
    `

    const { error } = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: 'Restablece tu contraseña — CloudMedHN',
      html: htmlContent,
    })

    if (error) {
      console.error('Error enviando email de reinicio:', error)
      return { error: error.message }
    }
    return { success: true }
  } catch (error) {
    console.error('Excepción enviando email de reinicio:', error)
    return { error: errorMessage(error, 'No se pudo enviar el correo.') }
  }
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
      from: fromEmail,
      to: [toEmail],
      subject: `Activa tu cuenta en ${clinicName} — CloudMedHN`,
      html: htmlContent,
    })

    if (error) {
      console.error('Error enviando email de acceso:', error)
      return { error: error.message }
    }
    return { success: true }
  } catch (error) {
    console.error('Excepción enviando email de acceso:', error)
    return { error: errorMessage(error, 'No se pudo enviar el correo.') }
  }
}

/**
 * Correo de bienvenida para aprovisionamiento con credenciales predefinidas.
 * Muestra el email y la contraseña inicial junto con el enlace de acceso.
 */
export async function sendWelcomeCredentialsEmail(params: {
  toEmail: string
  firstName: string
  clinicName: string
  role: string
  loginEmail: string
  password: string
  loginUrl: string
}): Promise<{ success?: boolean; error?: string }> {
  const { toEmail, firstName, clinicName, role, loginEmail, password, loginUrl } = params
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️ RESEND_API_KEY no configurada. Credenciales (solo local):', { loginEmail, password })
      return { success: true }
    }

    const resend = new Resend(process.env.RESEND_API_KEY)
    const roleEs = role === 'DOCTOR' ? 'Médico' : role === 'ASSISTANT' ? 'Asistente' : 'Administrador'
    const safeName = escapeHtml(firstName)
    const safeClinic = escapeHtml(clinicName)
    const safeEmail = escapeHtml(loginEmail)

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="margin:0;padding:20px;background-color:#f8fafc;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#0f172a;">
        <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="background:#0d9488;color:#fff;padding:30px 20px;text-align:center;">
            <h1 style="margin:0;font-size:24px;font-weight:600;">CloudMedHN</h1>
            <p style="margin:8px 0 0;font-size:14px;opacity:0.9;">Tu cuenta ya está lista</p>
          </div>
          <div style="padding:30px 20px;line-height:1.6;">
            <p>Hola <strong>${safeName}</strong>,</p>
            <p>Tu cuenta en <strong>CloudMedHN</strong> para <strong>${safeClinic}</strong> ha sido creada. Aquí están tus credenciales de acceso:</p>
            <div style="background:#f0fdf4;border:1px solid #86efac;border-left:4px solid #0d9488;border-radius:8px;padding:20px;margin:24px 0;">
              <table style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#475569;width:120px;">Plataforma:</td>
                  <td style="padding:6px 0;font-size:14px;color:#0f172a;">app.cloudmedhn.com</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#475569;">Usuario:</td>
                  <td style="padding:6px 0;font-size:14px;color:#0f172a;font-family:monospace;">${safeEmail}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#475569;">Contraseña:</td>
                  <td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:700;font-family:monospace;">${escapeHtml(password)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#475569;">Rol:</td>
                  <td style="padding:6px 0;font-size:14px;color:#0f172a;">${roleEs}</td>
                </tr>
              </table>
            </div>
            <div style="text-align:center;margin:28px 0;">
              <a href="${loginUrl}" style="display:inline-block;padding:13px 28px;background:#0d9488;color:#fff;text-decoration:none;border-radius:6px;font-weight:700;font-size:15px;">Iniciar sesión</a>
            </div>
            <p style="font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:16px;">Por seguridad, te recomendamos cambiar tu contraseña desde la configuración de tu perfil después de tu primer ingreso. Si tienes dudas, contacta al administrador de tu organización.</p>
          </div>
          <div style="background:#f1f5f9;padding:20px;text-align:center;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">
            <p style="margin:0;">© ${new Date().getFullYear()} CloudMedHN. Documento confidencial.</p>
          </div>
        </div>
      </body>
      </html>
    `

    const { error } = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: `Tu cuenta en CloudMedHN — ${clinicName}`,
      html: htmlContent,
    })

    if (error) {
      console.error('Error enviando correo de credenciales:', error)
      return { error: error.message }
    }
    return { success: true }
  } catch (error) {
    console.error('Excepción enviando correo de credenciales:', error)
    return { error: errorMessage(error, 'No se pudo enviar el correo.') }
  }
}

