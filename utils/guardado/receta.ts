import type { SupabaseClient } from '@supabase/supabase-js'
import type { Medicine } from '@/utils/medicines'
import { generateVerificationCode } from '@/utils/verification-code'

export const AVISO_RECETA = 'La consulta se guardó, pero la receta no pudo registrarse. Vuelve a generarla desde el expediente.'

interface DatosReceta {
  clinicId: string
  patientId: string
  consultationId: string
  doctorId: string
  medicines: Medicine[]
  diagnosis: string
  formData: FormData
}

export async function insertarReceta(
  supabase: SupabaseClient,
  { clinicId, patientId, consultationId, doctorId, medicines, diagnosis, formData }: DatosReceta,
): Promise<{ prescriptionId: string | null; warning: string | null }> {
  const verificationCode = generateVerificationCode('MC')
  const prescriptionNotes = formData.get('prescription_notes') as string || ''
  // El diagnóstico queda como snapshot cuando el médico marca el check.
  const includeDiagnosis = formData.get('include_diagnosis') === 'on'
  const prescriptionDiagnosis = includeDiagnosis ? (diagnosis?.trim() || null) : null

  // Solo se incluye la columna si hay un valor, para admitir el esquema anterior.
  const prescriptionInsert: Record<string, string | Medicine[] | null> = {
    clinic_id: clinicId,
    patient_id: patientId,
    consultation_id: consultationId,
    doctor_id: doctorId,
    medicines,
    notes: prescriptionNotes,
    verification_code: verificationCode
  }
  if (prescriptionDiagnosis) prescriptionInsert.diagnosis = prescriptionDiagnosis

  const { data: prescription, error: prescriptionError } = await supabase
    .from('prescriptions')
    .insert([prescriptionInsert])
    .select()
    .single()

  if (prescriptionError) {
    console.error('Error al insertar receta en DB:', prescriptionError)
    return { prescriptionId: null, warning: AVISO_RECETA }
  }

  // El guardado solo crea el registro. La impresión usa HTML y el envío genera el PDF al vuelo.
  return { prescriptionId: prescription.id, warning: null }
}
