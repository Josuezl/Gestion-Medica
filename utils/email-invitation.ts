import { Resend } from 'resend'

const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'

export async function sendInvitationEmail(
  toEmail: string,
  clinicName: string,
  role: string,
  specialty: string | null,
  inviterName: string,
  token: string
) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️ RESEND_API_KEY no está configurada. Simulando envío de correo en entorno local.')
      return { success: true, data: { id: 'simulated_email_id' } }
    }
    
    const resend = new Resend(process.env.RESEND_API_KEY)
    const roleEs = role === 'DOCTOR' ? 'Médico' : 'Asistente'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const inviteLink = `${appUrl}/register?invite=${token}`

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; }
          .header { background-color: #0d9488; color: #ffffff; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 30px 20px; line-height: 1.6; }
          .content p { margin: 0 0 15px; font-size: 16px; }
          .button-container { text-align: center; margin: 30px 0; }
          .button { display: inline-block; padding: 12px 24px; background-color: #0d9488; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; }
          .footer { background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0; }
          .footer p { margin: 0; }
          .details-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin: 20px 0; }
          .details-box ul { margin: 0; padding: 0; list-style: none; }
          .details-box li { margin-bottom: 8px; font-size: 15px; }
          .details-box li strong { color: #334155; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>MedConnect</h1>
          </div>
          <div class="content">
            <p>Hola,</p>
            <p><strong>El Dr./a ${inviterName}</strong> te ha invitado a unirte a su equipo en la plataforma MedConnect.</p>
            
            <div class="details-box">
              <ul>
                <li><strong>Clínica:</strong> ${clinicName}</li>
                <li><strong>Rol asignado:</strong> ${roleEs}</li>
                ${specialty ? `<li><strong>Especialidad:</strong> ${specialty}</li>` : ''}
              </ul>
            </div>
            
            <p>Para aceptar la invitación y configurar tu cuenta, haz clic en el siguiente botón:</p>
            
            <div class="button-container">
              <a href="${inviteLink}" class="button">Crear mi cuenta</a>
            </div>
            
            <p>Si no esperabas esta invitación, puedes ignorar este correo.</p>
          </div>
          <div class="footer">
            <p>Esta invitación expirará en 7 días.</p>
            <p>© ${new Date().getFullYear()} MedConnect. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `

    const { data, error } = await resend.emails.send({
      from: `MedConnect <${fromEmail}>`,
      to: [toEmail],
      subject: `Invitación a unirte a ${clinicName} en MedConnect`,
      html: htmlContent,
    })

    if (error) {
      console.error('Error enviando email:', error)
      return { error: error.message }
    }

    return { success: true, data }
  } catch (error: any) {
    console.error('Excepción enviando email:', error)
    return { error: error.message }
  }
}
