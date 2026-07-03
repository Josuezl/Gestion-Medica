'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/utils/auth-guard'
import { generateVerificationCode } from '@/utils/verification-code'
import { validateVitals } from '@/utils/validation'
import { safeErrorMessage } from '@/utils/errors'
import type { Medicine } from '@/utils/medicines'

interface CatalogStudyItem { section: string; name: string; description?: string | null; indication?: string | null }

/**
 * Agrega al catálogo de estudios de la clínica los estudios que el médico ingresó manualmente y
 * marcó para "guardar para la próxima vez". Crea la sección si no existe y evita duplicados por
 * nombre dentro de la sección. Catálogo compartido por toda la clínica (RLS por clinic_id).
 */
async function saveStudiesToCatalog(supabase: SupabaseClient, clinicId: string, items: CatalogStudyItem[]) {
  const bySection = new Map<string, CatalogStudyItem[]>()
  for (const it of items) {
    const sec = (it.section || 'Otros').trim() || 'Otros'
    if (!bySection.has(sec)) bySection.set(sec, [])
    bySection.get(sec)!.push(it)
  }
  for (const [sectionName, group] of bySection) {
    // Buscar o crear la sección.
    let sectionId: string | null = null
    const { data: existing } = await supabase
      .from('study_sections')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('name', sectionName)
      .maybeSingle()
    if (existing) {
      sectionId = existing.id
    } else {
      const { data: last } = await supabase
        .from('study_sections')
        .select('sort_order')
        .eq('clinic_id', clinicId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      const sort = ((last?.sort_order ?? -1) as number) + 1
      const { data: created } = await supabase
        .from('study_sections')
        .insert([{ clinic_id: clinicId, name: sectionName, sort_order: sort }])
        .select('id')
        .single()
      sectionId = created?.id ?? null
    }
    if (!sectionId) continue

    const { data: lastStudy } = await supabase
      .from('study_catalog')
      .select('sort_order')
      .eq('section_id', sectionId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    let sort = ((lastStudy?.sort_order ?? -1) as number) + 1

    for (const it of group) {
      const { data: dup } = await supabase
        .from('study_catalog')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('section_id', sectionId)
        .eq('name', it.name)
        .maybeSingle()
      if (dup) continue
      await supabase.from('study_catalog').insert([{
        clinic_id: clinicId,
        section_id: sectionId,
        name: it.name,
        description: it.description || null,
        patient_indication: it.indication || null,
        sort_order: sort++,
      }])
    }
  }
}

export async function createConsultation(
  patientId: string,
  appointmentId: string | null,
  medicines: Medicine[],
  formData: FormData,
  preclinicalVitalsId: string | null = null
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
  const referral = formData.get('referral') as string || null
  const diagnosis = formData.get('diagnosis') as string
  const treatmentPlan = formData.get('treatment_plan') as string

  const bp = formData.get('blood_pressure') as string || null
  const tempVal = formData.get('temperature') as string
  const weightVal = formData.get('weight') as string
  const heightVal = formData.get('height') as string
  const headCircVal = formData.get('head_circumference') as string
  const hrVal = formData.get('heart_rate') as string
  const rrVal = formData.get('respiratory_rate') as string
  const oxVal = formData.get('oxygen_saturation') as string

  const temperature = tempVal ? parseFloat(tempVal) : null
  const weight = weightVal ? parseFloat(weightVal) : null
  const height = heightVal ? parseFloat(heightVal) : null
  const headCircumference = headCircVal ? parseFloat(headCircVal) : null
  const heartRate = hrVal ? parseInt(hrVal, 10) : null
  const respiratoryRate = rrVal ? parseInt(rrVal, 10) : null
  const oxygenSaturation = oxVal ? parseInt(oxVal, 10) : null

  // 2.b Validar rangos de los signos vitales (lógica en utils/validation.ts, testeable). Evita el
  //     críptico "numeric field overflow" cuando hay un error de dedo (p. ej. peso en gramos).
  const vitalError = validateVitals({ temperature, weight, height, headCircumference, heartRate, respiratoryRate, oxygenSaturation })
  if (vitalError) return { error: vitalError }

  // 3. Insertar la consulta
  const { data: consultation, error: consultError } = await supabase
    .from('consultations')
    .insert([{
      clinic_id: clinicId,
      patient_id: patientId,
      // Liga la consulta con la cita de la que nació (si viene de una). Permite validar que una cita
      // marcada "Realizada" tenga consulta, y auditar a qué cita pertenece. Es null si no viene de cita.
      appointment_id: appointmentId,
      doctor_id: user.id,
      reason_for_visit: reasonForVisit,
      symptoms,
      physical_exam: physicalExam,
      medical_leave: medicalLeave,
      referral,
      diagnosis,
      treatment_plan: treatmentPlan,
      blood_pressure: bp,
      temperature,
      weight,
      height,
      head_circumference: headCircumference,
      heart_rate: heartRate,
      respiratory_rate: respiratoryRate,
      oxygen_saturation: oxygenSaturation
    }])
    .select()
    .single()

  if (consultError) {
    return { error: safeErrorMessage('No se pudo registrar la consulta. Inténtalo de nuevo.', 'createConsultation', consultError) }
  }

  // La consulta (nota clínica) es la fuente de verdad y ya quedó guardada. Los pasos
  // siguientes (receta, PDF, WhatsApp, orden de laboratorio, cita) son secundarios: si alguno
  // falla NO se descarta la consulta, pero se acumula un aviso para informarle al médico en vez
  // de reportar un éxito silencioso con estado parcial (hallazgo A3).
  const warnings: string[] = []

  // 3.b Antecedentes del paciente: el médico pudo verlos/editarlos en el formulario. Se persisten
  //     en el expediente del paciente (sobrescriben lo anterior). Acotado a la clínica. Solo llegan
  //     aquí roles clínicos (requireRole arriba), así que no hace falta otro gate. Si falla, solo avisa.
  try {
    const antecedentes = {
      // Se guarda tal cual lo escribió el médico (vacío → null). No se re-aplica "Ninguna conocida":
      // si el médico escribe "Ninguna", "No" o cualquier texto, se conserva y se muestra la próxima vez.
      allergies: (formData.get('allergies') as string) || null,
      pathological_history: (formData.get('pathological_history') as string) || null,
      non_pathological_history: (formData.get('non_pathological_history') as string) || null,
      family_history: (formData.get('family_history') as string) || null,
    }
    if (formData.has('allergies') || formData.has('pathological_history') || formData.has('non_pathological_history') || formData.has('family_history')) {
      const { error: antErr } = await supabase
        .from('patients')
        .update(antecedentes)
        .eq('id', patientId)
        .eq('clinic_id', clinicId)
      if (antErr) {
        console.error('No se pudieron actualizar los antecedentes del paciente:', antErr)
        warnings.push('La consulta se guardó, pero no se pudieron actualizar los antecedentes del paciente.')
      }
    }
  } catch (e) {
    console.error('Error actualizando antecedentes del paciente:', e)
  }

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
    const prescriptionInsert: Record<string, string | Medicine[] | null> = {
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

  // 4.c Solicitud de estudios (opcional). Mismo patrón que la orden de laboratorio: solo se inserta
  //      si el médico marcó estudios. La indicación de cada estudio viaja dentro del snapshot JSONB.
  let studyRequestId: string | null = null
  try {
    const raw = formData.get('study_request')
    if (typeof raw === 'string' && raw) {
      const parsed = JSON.parse(raw) as {
        studies?: CatalogStudyItem[]
        otherStudies?: string
        manualToCatalog?: CatalogStudyItem[]
      }
      const studies = Array.isArray(parsed?.studies) ? parsed.studies : []
      const otherStudies = (parsed?.otherStudies || '').trim()
      if (studies.length > 0 || otherStudies) {
        const studyVerificationCode = generateVerificationCode('EST')
        const { data: studyReq, error: studyErr } = await supabase
          .from('study_requests')
          .insert([{
            clinic_id: clinicId,
            patient_id: patientId,
            consultation_id: consultation.id,
            doctor_id: user.id,
            studies,
            other_studies: otherStudies || null,
            verification_code: studyVerificationCode,
          }])
          .select('id')
          .single()
        if (studyErr) {
          console.error('Error al insertar solicitud de estudios:', studyErr)
          warnings.push('La consulta se guardó, pero la solicitud de estudios no pudo registrarse.')
        } else {
          studyRequestId = studyReq.id
          // Estudios manuales marcados para guardar en el catálogo compartido de la clínica.
          const toCatalog = Array.isArray(parsed?.manualToCatalog) ? parsed.manualToCatalog : []
          if (toCatalog.length > 0) {
            try {
              await saveStudiesToCatalog(supabase, clinicId, toCatalog)
            } catch (e) {
              console.error('No se pudieron guardar los estudios manuales en el catálogo:', e)
              warnings.push('La solicitud se guardó, pero algún estudio manual no se agregó al catálogo.')
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('Solicitud de estudios: study_request inválido', e)
    warnings.push('No se pudo procesar la solicitud de estudios (datos inválidos).')
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

  // 5.b Si la consulta nació de una pre-clínica (signos tomados por enfermería), marcarla como
  //     consumida (bitácora). Paso secundario: si falla, solo se avisa (no descarta la consulta).
  if (preclinicalVitalsId) {
    const { error: preError } = await supabase
      .from('preclinical_vitals')
      .update({ consumed_at: new Date().toISOString(), consultation_id: consultation.id })
      .eq('id', preclinicalVitalsId)
    if (preError) {
      console.error('Error al marcar la pre-clínica como consumida:', preError)
      warnings.push('La consulta se guardó, pero no se pudo cerrar la pre-clínica de enfermería.')
    }
  }

  // 6. Revalidar. La navegación la maneja el cliente (para ofrecer imprimir
  // la incapacidad médica en un modal si se llenó ese campo).
  revalidatePath(`/dashboard/patients/${patientId}`)
  revalidatePath('/dashboard')
  return {
    success: true,
    consultationId: consultation.id,
    hasMedicalLeave: !!(medicalLeave && medicalLeave.trim()),
    hasReferral: !!(referral && referral.trim()),
    hasPrescription: !!(medicines && medicines.length > 0 && prescriptionId),
    prescriptionId,
    hasLabOrder: !!labOrderId,
    labOrderId,
    hasStudyRequest: !!studyRequestId,
    studyRequestId,
    warnings,
  }
}

/**
 * Emite (o corrige) SOLO la incapacidad médica de una consulta ya guardada, sin tocar ningún otro
 * campo clínico. Pensado para el caso "el médico guardó la consulta y luego el paciente pide una
 * incapacidad". NO es una edición de consulta: el `.update()` escribe únicamente `medical_leave`,
 * así que síntomas/diagnóstico/plan/vitales quedan intactos. La corrección (si ya había incapacidad)
 * queda auditada con old->new por el trigger `on_consultation_modified`.
 */
export async function updateConsultationMedicalLeave(consultationId: string, medicalLeave: string) {
  // Solo roles clínicos (igual que createConsultation).
  const ctx = await requireRole(['ADMIN', 'DOCTOR', 'MEDICO', 'MÉDICO'])
  if (!ctx) return { error: 'No autorizado. Solo los médicos pueden emitir incapacidades.' }

  const text = (medicalLeave || '').trim()
  if (!text) return { error: 'Escribe el texto de la incapacidad.' }

  const supabase = await createClient()

  // Acotar a la clínica del usuario (defensa en profundidad además de RLS) y obtener patient_id
  // para revalidar el expediente correcto.
  const { data: updated, error } = await supabase
    .from('consultations')
    .update({ medical_leave: text })
    .eq('id', consultationId)
    .eq('clinic_id', ctx.clinicId)
    .select('id, patient_id')
    .single()

  if (error) {
    return { error: safeErrorMessage('No se pudo guardar la incapacidad. Inténtalo de nuevo.', 'updateConsultationMedicalLeave', error) }
  }
  if (!updated) {
    return { error: 'No tienes permiso para modificar esta consulta.' }
  }

  revalidatePath(`/dashboard/patients/${updated.patient_id}`)
  return { success: true, consultationId: updated.id }
}
