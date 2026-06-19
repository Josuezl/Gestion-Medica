'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { generatePrescriptionPDF } from '@/utils/pdf-generator'
import { sendPrescriptionNotification } from '@/utils/whatsapp'
import { requireRole } from '@/utils/auth-guard'
import { doctorShortName } from '@/utils/doctorName'
import { formatDateHN } from '@/utils/datetime'

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

  // 4. Si hay medicamentos agregados, registrar la receta, generar PDF y subir a Storage
  let prescriptionId: string | null = null
  if (medicines && medicines.length > 0) {
    const verificationCode = `MC-${Math.random().toString(36).substring(2, 11).toUpperCase()}`
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
    } else {
      prescriptionId = prescription.id
      try {
        // Cargar información completa de paciente, clínica y doctor para el PDF
        const { data: patient } = await supabase.from('patients').select('*').eq('id', patientId).single()
        const { data: clinic } = await supabase.from('clinics').select('*').eq('id', clinicId).single()
        const { data: docProfile } = await supabase.from('user_profiles').select('*').eq('id', user.id).single()

        const calculateAge = (birthDateString: string) => {
          const today = new Date()
          const birthDate = new Date(birthDateString)
          let age = today.getFullYear() - birthDate.getFullYear()
          const m = today.getMonth() - birthDate.getMonth()
          if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
          return age
        }

        const formattedDate = formatDateHN(consultation.created_at)

        // Generar el PDF
        const pdfBuffer = await generatePrescriptionPDF({
          clinicName: docProfile?.practice_name || clinic?.name || 'Consultorio Médico',
          clinicPhone: docProfile?.practice_phone || clinic?.phone || 'N/A',
          clinicAddress: docProfile?.practice_address || clinic?.address || 'Honduras',
          doctorName: doctorShortName(docProfile?.first_name, docProfile?.last_name, docProfile?.gender),
          doctorSpecialty: docProfile?.specialty || 'Medicina General',
          doctorProfessionalId: docProfile?.professional_id || 'N/A',
          patientName: `${patient?.first_name} ${patient?.last_name}`,
          patientAge: patient ? calculateAge(patient.birth_date) : 0,
          patientDni: patient?.id_card || 'N/A',
          date: formattedDate,
          medicines,
          notes: prescriptionNotes,
          diagnosis: prescriptionDiagnosis || undefined,
          verificationCode,
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL || '',
          doctorSignatureUrl: docProfile?.signature_url || undefined
        })

        // Subir el PDF a Supabase Storage
        const filePath = `${clinicId}/${patientId}/${prescription.id}.pdf`
        const { error: uploadError } = await supabase.storage
          .from('prescriptions')
          .upload(filePath, Buffer.from(pdfBuffer), {
            contentType: 'application/pdf',
            upsert: true
          })

        if (uploadError) {
          console.error('Error al subir PDF a Storage:', uploadError)
        } else {
          // Actualizar el registro de la receta con la ubicación del PDF
          await supabase
            .from('prescriptions')
            .update({ pdf_url: filePath })
            .eq('id', prescription.id)

          // Generar URL firmada por 24 horas para enviar por WhatsApp
          const { data: signedData } = await supabase.storage
            .from('prescriptions')
            .createSignedUrl(filePath, 86400) // 24 horas

          if (signedData?.signedUrl && patient?.phone) {
            const docName = doctorShortName(docProfile?.first_name, docProfile?.last_name, docProfile?.gender)
            const patientName = `${patient.first_name} ${patient.last_name}`
            await sendPrescriptionNotification(
              patient.phone,
              patientName,
              docName,
              signedData.signedUrl,
              verificationCode
            )
          }
        }
      } catch (pdfErr) {
        console.error('Error en el flujo de PDF de receta:', pdfErr)
      }
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
        const { data: labOrder, error: labErr } = await supabase
          .from('lab_orders')
          .insert([{
            clinic_id: clinicId,
            patient_id: patientId,
            consultation_id: consultation.id,
            doctor_id: user.id,
            tests,
            other_tests: otherTests || null,
          }])
          .select('id')
          .single()
        if (labErr) console.error('Error al insertar orden de laboratorio:', labErr)
        else labOrderId = labOrder.id
      }
    }
  } catch (e) {
    console.error('Orden de laboratorio: lab_order inválido', e)
  }

  // 5. Si viene de una cita agendada, actualizar su estado a COMPLETED
  if (appointmentId) {
    const { error: apptError } = await supabase
      .from('appointments')
      .update({ status: 'COMPLETED' })
      .eq('id', appointmentId)

    if (apptError) {
      console.error('Error al actualizar estado de la cita:', apptError)
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
  }
}
