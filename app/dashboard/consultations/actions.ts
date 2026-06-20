'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/utils/auth-guard'
import { generateVerificationCode } from '@/utils/verification-code'
import { validateVitals } from '@/utils/validation'

export async function createConsultation(
  patientId: string,
  appointmentId: string | null,
  medicines: any[],
  formData: FormData
) {
  // 1. Verificar autorización y roles (Solo médicos y admin pueden crear consultas)
  const ctx = await requireRole(['ADMIN', 'DOCTOR', 'MEDICO', 'MÉDICO'])
  if (!ctx) return { error: 'No autorizado. Solo los médicos pueden crear consultas.' }

  const supabase = await createClient()
  const clinicId = ctx.clinicId
  const user = ctx.user

  // 2. Extraer datos de signos vitales y notas clínicas
  const reasonForVisit = formData.get('reason_for_visit') as string
  const symptoms = formData.get('symptoms') as string || null
  const physicalExam = formData.get('physical_exam') as string || null
  const medicalLeave = formData.get('medical_leave') as string || null
  const diagnosis = formData.get('diagnosis') as string
  const treatmentPlan = formData.get('treatment_plan') as string

  const bp = formData.get('blood_pressure') as string || null
  const tempVal = formData.get('temperature') as string
  const weightVal = formData.get('weight') as string
  const heightVal = formData.get('height') as string
  const headCircVal = formData.get('head_circumference') as string
  const hrVal = formData.get('heart_rate') as string
  const oxVal = formData.get('oxygen_saturation') as string

  const temperature = tempVal ? parseFloat(tempVal) : null
  const weight = weightVal ? parseFloat(weightVal) : null
  const height = heightVal ? parseFloat(heightVal) : null
  const headCircumference = headCircVal ? parseFloat(headCircVal) : null
  const heartRate = hrVal ? parseInt(hrVal, 10) : null
  const oxygenSaturation = oxVal ? parseInt(oxVal, 10) : null

  // 2.b Validar rangos de los signos vitales (lógica en utils/validation.ts, testeable). Evita el
  //     críptico "numeric field overflow" cuando hay un error de dedo (p. ej. peso en gramos).
  const vitalError = validateVitals({ temperature, weight, height, headCircumference, heartRate, oxygenSaturation })
  if (vitalError) return { error: vitalError }

  // 3. Insertar la consulta
  const { data: consultation, error: consultError } = await supabase
    .from('consultations')
    .insert([{
      clinic_id: clinicId,
      patient_id: patientId,
      doctor_id: user.id,
      reason_for_visit: reasonForVisit,
      symptoms,
      physical_exam: physicalExam,
      medical_leave: medicalLeave,
      diagnosis,
      treatment_plan: treatmentPlan,
      blood_pressure: bp,
      temperature,
      weight,
      height,
      head_circumference: headCircumference,
      heart_rate: heartRate,
      oxygen_saturation: oxygenSaturation
    }])
    .select()
    .single()

  if (consultError) {
    return { error: `Error al registrar consulta: ${consultError.message}` }
  }

  // La consulta (nota clínica) es la fuente de verdad y ya quedó guardada. Los pasos
  // siguientes (receta, PDF, WhatsApp, orden de laboratorio, cita) son secundarios: si alguno
  // falla NO se descarta la consulta, pero se acumula un aviso para informarle al médico en vez
  // de reportar un éxito silencioso con estado parcial (hallazgo A3).
  const warnings: string[] = []

  // 4. Si hay medicamentos agregados, registrar la receta, generar PDF y subir a Storage
  let prescriptionId: string | null = null
  if (medicines && medicines.length > 0) {
    const verificationCode = generateVerificationCode('MC')
    const prescriptionNotes = formData.get('prescription_notes') as string || ''
    // El médico puede pedir que el diagnóstico de la consulta se imprima en la receta
    // (algunas aseguradoras lo exigen). Se guarda como snapshot solo si marca el check.
    const includeDiagnosis = formData.get('include_diagnosis') === 'on'
    const prescriptionDiagnosis = includeDiagnosis ? (diagnosis?.trim() || null) : null

    // La columna `diagnosis` solo se incluye en el insert cuando hay valor, para no romper
    // la creación de recetas normales si la migración (ALTER TABLE) aún no se ha aplicado.
    const prescriptionInsert: Record<string, any> = {
      clinic_id: clinicId,
      patient_id: patientId,
      consultation_id: consultation.id,
      doctor_id: user.id,
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
      warnings.push('La consulta se guardó, pero la receta no pudo registrarse. Vuelve a generarla desde el expediente.')
    } else {
      // Solo se crea el registro de la receta. El PDF NO se genera ni se almacena al guardar:
      // imprimir usa HTML, y el envío por correo/WhatsApp es una acción manual del médico (el PDF
      // del correo se genera al vuelo al enviar). Esto evita gastar Storage por cada consulta y
      // hace el guardado más rápido (sin render de PDF, subida ni llamada a WhatsApp).
      prescriptionId = prescription.id
    }
  }

  // 4.b Orden de laboratorio (opcional). Solo se inserta si el médico marcó exámenes,
  //      para no tocar la tabla en consultas normales (ni romper si la migración no se aplicó).
  let labOrderId: string | null = null
  try {
    const raw = formData.get('lab_order')
    if (typeof raw === 'string' && raw) {
      const parsed = JSON.parse(raw) as { tests?: { category: string; name: string }[]; otherTests?: string }
      const tests = Array.isArray(parsed?.tests) ? parsed.tests : []
      const otherTests = (parsed?.otherTests || '').trim()
      if (tests.length > 0 || otherTests) {
        const labVerificationCode = generateVerificationCode('LAB')
        const { data: labOrder, error: labErr } = await supabase
          .from('lab_orders')
          .insert([{
            clinic_id: clinicId,
            patient_id: patientId,
            consultation_id: consultation.id,
            doctor_id: user.id,
            tests,
            other_tests: otherTests || null,
            verification_code: labVerificationCode,
          }])
          .select('id')
          .single()
        if (labErr) {
          console.error('Error al insertar orden de laboratorio:', labErr)
          warnings.push('La consulta se guardó, pero la orden de laboratorio no pudo registrarse.')
        } else {
          labOrderId = labOrder.id
        }
      }
    }
  } catch (e) {
    console.error('Orden de laboratorio: lab_order inválido', e)
    warnings.push('No se pudo procesar la orden de laboratorio (datos inválidos).')
  }

  // 5. Si viene de una cita agendada, actualizar su estado a COMPLETED
  if (appointmentId) {
    const { error: apptError } = await supabase
      .from('appointments')
      .update({ status: 'COMPLETED' })
      .eq('id', appointmentId)

    if (apptError) {
      console.error('Error al actualizar estado de la cita:', apptError)
      warnings.push('La consulta se guardó, pero no se pudo marcar la cita como completada.')
    }
  }

  // 6. Revalidar. La navegación la maneja el cliente (para ofrecer imprimir
  // la incapacidad médica en un modal si se llenó ese campo).
  revalidatePath(`/dashboard/patients/${patientId}`)
  return {
    success: true,
    consultationId: consultation.id,
    hasMedicalLeave: !!(medicalLeave && medicalLeave.trim()),
    hasPrescription: !!(medicines && medicines.length > 0 && prescriptionId),
    prescriptionId,
    hasLabOrder: !!labOrderId,
    labOrderId,
    warnings,
  }
}
