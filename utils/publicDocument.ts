import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { PatientRow, DoctorProfileRow, ClinicRow } from '@/utils/clinicalTypes'

/**
 * Acceso público (por código) a los documentos con membrete para que el paciente los abra desde el
 * link de WhatsApp/correo. Mismo modelo de seguridad que /prescriptions/view: el `verification_code`
 * es la llave. Además, el PERSONAL autenticado de la misma clínica entra SIN código (no se rompe el
 * "Imprimir" desde el expediente).
 */

/** Normaliza un código para comparar: mayúsculas, sin guiones (largos o normales) ni espacios. */
export function sanitizeDocCode(raw?: string | null): string {
  return (raw || '')
    .trim()
    .toUpperCase()
    .replace(/[–—]/g, '-')
    .replace(/[\s-]/g, '')
}

export type PublicDocResult<Doc = Record<string, unknown>> = {
  status: 'ok' | 'gate' | 'notfound'
  doc?: Doc
  patient?: PatientRow
  doctor?: DoctorProfileRow
  clinic?: ClinicRow
  hasError?: boolean
}

/**
 * Carga un documento (consultation | lab_order | study_request) autorizando por sesión de personal
 * de la clínica O por `code`. Devuelve también paciente/médico/clínica (vía service_role, ya que el
 * acceso quedó autorizado). `status: 'gate'` = existe pero falta/!coincide el código (mostrar portal).
 * `Doc` es la forma de la fila de `table` que espera la página que lo consume.
 */
export async function loadPublicDocument<Doc = Record<string, unknown>>(table: 'consultations' | 'lab_orders' | 'study_requests', id: string, code: string | undefined): Promise<PublicDocResult<Doc>> {
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: doc } = await admin.from(table).select('*').eq('id', id).single()
  if (!doc) return { status: 'notfound' }

  // 1) Personal autenticado de la misma clínica → acceso sin código.
  let authorized = false
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await admin.from('user_profiles').select('clinic_id').eq('id', user.id).single()
      if (profile?.clinic_id === doc.clinic_id) authorized = true
    }
  } catch {
    // sin sesión válida → se evalúa el código
  }

  // 2) Código público válido.
  if (!authorized) {
    const a = sanitizeDocCode(code)
    const b = sanitizeDocCode(doc.verification_code)
    if (a && a === b) authorized = true
  }

  if (!authorized) return { status: 'gate', hasError: !!code }

  const [patientRes, doctorRes, clinicRes] = await Promise.all([
    admin.from('patients').select('*').eq('id', doc.patient_id).single(),
    admin.from('user_profiles').select('*').eq('id', doc.doctor_id).single(),
    admin.from('clinics').select('*').eq('id', doc.clinic_id).single(),
  ])
  if (!patientRes.data || !doctorRes.data || !clinicRes.data) return { status: 'notfound' }

  return { status: 'ok', doc, patient: patientRes.data, doctor: doctorRes.data, clinic: clinicRes.data }
}
