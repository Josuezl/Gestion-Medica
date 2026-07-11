import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/utils/auth-guard'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimit } from '@/utils/rateLimit'
import { parseClientErrorReport, clientErrorReportToHtml, clientErrorReportSubject } from '@/utils/clientErrorReport'
import { sendClientErrorReportEmail } from '@/utils/email'
import { formatDateTimeHN } from '@/utils/datetime'
import { errorMessage } from '@/utils/errors'

/**
 * Recibe reportes de errores del cliente (hoy: fallos de guardado de consulta CON internet) y
 * los reenvía por correo al equipo técnico. Motivación: el 2026-07-10 un médico tuvo el botón
 * de guardar "colgado" dos veces por deploys en caliente y solo nos enteramos porque avisó.
 *
 * Seguridad: requiere sesión de un usuario del sistema (cualquier rol clínico); el payload se
 * valida/normaliza en utils/clientErrorReport.ts (sin PHI); y hay rate limit por usuario
 * (5 por 10 min, fail-open) para que un cliente con un bug en loop no queme la cuota de Resend.
 */
export async function POST(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    // body inválido → cae al 400 de abajo
  }
  const report = parseClientErrorReport(body)
  if (!report) {
    return NextResponse.json({ error: 'Reporte inválido' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const allowed = await checkRateLimit(admin, `client-error:${ctx.user.id}`, 5, 600)
    if (!allowed) {
      return NextResponse.json({ error: 'Demasiados reportes, intenta más tarde' }, { status: 429 })
    }

    const html = clientErrorReportToHtml(report, {
      userName: `${ctx.profile.first_name} ${ctx.profile.last_name}`.trim(),
      clinicName: ctx.clinicName || ctx.clinicId,
      role: ctx.role,
      when: formatDateTimeHN(new Date()),
    })
    const result = await sendClientErrorReportEmail(clientErrorReportSubject(report.kind, ctx.clinicName || ctx.clinicId), html)

    if (!result.success) {
      console.error('No se pudo enviar el reporte de error de cliente:', result.error)
      return NextResponse.json({ error: 'No se pudo enviar el reporte' }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error procesando reporte de error de cliente:', errorMessage(err, 'desconocido'))
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
