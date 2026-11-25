import { revalidatePath } from 'next/cache'
import { getAuthContext } from '@/utils/auth-guard'
import type { ParametrosConsultaDental } from '@/utils/camposGuardado'
import { safeErrorMessage } from '@/utils/errors'
import { createClient } from '@/utils/supabase/server'
import { AVISO_RECETA, insertarReceta } from './receta'

function texto(fd: FormData, campo: string): string | null {
  const valor = fd.get(campo)
  return typeof valor === 'string' ? valor.trim() || null : null
}

export async function guardarConsultaDental(
  { patientId, appointmentId, medicines, denticion, estado }: ParametrosConsultaDental,
  fd: FormData,
): Promise<{ success: true; consultationId: string; warnings?: string[] } | { error: string }> {
  const ctx = await getAuthContext()
  if (!ctx?.isDentist) return { error: 'Solo los odontólogos pueden guardar consultas dentales.' }

  const reason = texto(fd, 'reason_for_visit')
  if (!reason) return { error: 'Escribe el motivo de consulta.' }
  const diagnosis = texto(fd, 'diagnosis')
  if (!diagnosis) return { error: 'Escribe el diagnóstico.' }
  const treatmentPlan = texto(fd, 'treatment_plan')
  if (!treatmentPlan) return { error: 'Escribe el plan de tratamiento.' }

  const supabase = await createClient()
  const { data: consultationId, error } = await supabase.rpc('guardar_consulta_dental', {
    p_patient_id: patientId,
    p_appointment_id: appointmentId,
    p_reason: reason,
    p_intraoral_exam: texto(fd, 'intraoral_exam'),
    p_diagnosis: diagnosis,
    p_procedures_done: texto(fd, 'procedures_done'),
    p_treatment_plan: treatmentPlan,
    p_denticion: denticion,
    p_estado: estado,
  })
  if (error) {
    return { error: safeErrorMessage('No se pudo registrar la consulta. Inténtalo de nuevo.', 'guardarConsultaDental', error) }
  }

  const warnings: string[] = []
  if (medicines.length > 0) {
    try {
      const { warning } = await insertarReceta(supabase, {
        clinicId: ctx.clinicId,
        patientId,
        consultationId,
        doctorId: ctx.user.id,
        medicines,
        diagnosis,
        formData: fd,
      })
      if (warning) warnings.push(warning)
    } catch (error) {
      warnings.push(safeErrorMessage(AVISO_RECETA, 'guardarConsultaDental: receta', error))
    }
  }

  revalidatePath(`/dashboard/patients/${patientId}`)
  revalidatePath('/dashboard')
  return { success: true, consultationId, warnings }
}
