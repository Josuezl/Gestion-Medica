import { revalidatePath } from 'next/cache'
import { getAuthContext } from '@/utils/auth-guard'
import type { ParametrosConsultaDental } from '@/utils/camposGuardado'
import { safeErrorMessage } from '@/utils/errors'
import { createClient } from '@/utils/supabase/server'
import { leaveFromFormData, validateLeave } from '@/utils/incapacidad'
import { AVISO_RECETA, insertarReceta } from './receta'
import { registrarSolicitudEstudios } from './estudios'

function texto(fd: FormData, campo: string): string | null {
  const valor = fd.get(campo)
  return typeof valor === 'string' ? valor.trim() || null : null
}

export async function guardarConsultaDental(
  { patientId, appointmentId, medicines, denticion, estado }: ParametrosConsultaDental,
  fd: FormData,
): Promise<{
  success: true; consultationId: string; warnings?: string[]; studyRequestId: string | null; hasMedicalLeave: boolean
} | { error: string }> {
  const ctx = await getAuthContext()
  if (!ctx?.isDentist) return { error: 'Solo los odontólogos pueden guardar consultas dentales.' }

  const reason = texto(fd, 'reason_for_visit')
  if (!reason) return { error: 'Escribe el motivo de consulta.' }
  const diagnosis = texto(fd, 'diagnosis')
  if (!diagnosis) return { error: 'Escribe el diagnóstico.' }
  const treatmentPlan = texto(fd, 'treatment_plan')
  if (!treatmentPlan) return { error: 'Escribe el plan de tratamiento.' }
  // Incapacidad (opcional): mismas reglas que en la consulta médica. Se valida antes de guardar nada.
  const leave = leaveFromFormData(fd)
  const leaveError = validateLeave(leave)
  if (leaveError) return { error: leaveError }

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
  if (leave.reason) {
    // La consulta y el odontograma ya quedaron guardados juntos por el RPC; la incapacidad se agrega
    // después. Si falla, la consulta no se pierde: se avisa para emitirla desde el expediente.
    const { data: actualizada, error: leaveUpdateError } = await supabase.from('consultations').update({
      medical_leave: leave.reason,
      ...(leave.startDate
        ? { leave_start_date: leave.startDate, leave_days: leave.days, leave_diagnosis: leave.diagnosis, leave_issued_at: new Date().toISOString() }
        : {}),
    }).eq('id', consultationId).select('id')
    if (leaveUpdateError || !actualizada?.length) {
      console.error('Error al registrar la incapacidad dental:', leaveUpdateError)
      warnings.push('La consulta se guardó, pero la incapacidad no pudo registrarse. Emítela desde el expediente.')
    }
  }
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

  const estudios = await registrarSolicitudEstudios(supabase, {
    clinicId: ctx.clinicId, patientId, consultationId, doctorId: ctx.user.id, formData: fd,
  })
  warnings.push(...estudios.warnings)

  revalidatePath(`/dashboard/patients/${patientId}`)
  revalidatePath('/dashboard')
  return { success: true, consultationId, warnings, studyRequestId: estudios.studyRequestId, hasMedicalLeave: !!leave.reason }
}
