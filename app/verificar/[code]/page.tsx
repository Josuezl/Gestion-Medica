import React from 'react'
import { createClient } from '@supabase/supabase-js'
import { CheckCircle, AlertCircle, FileText, User, Stethoscope, ClipboardList } from 'lucide-react'
import { formatDateHN } from '@/utils/datetime'
import { doctorTitle } from '@/utils/doctorName'

// Página PÚBLICA: usa el cliente service_role porque RLS bloquea el acceso anónimo.
// Se instancia DENTRO del componente (no a nivel de módulo) para no romper el build.
// Resuelve dos tipos de documento por su código: recetas e incapacidades (consultas).
export default async function VerifyDocumentPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: prescription } = await supabaseAdmin
    .from('prescriptions')
    .select(`
      id, created_at, medicines, notes, verification_code,
      clinics ( name, phone, address ),
      patients ( first_name, last_name ),
      user_profiles!doctor_id ( first_name, last_name, specialty )
    `)
    .eq('verification_code', code)
    .single()

  // Si no es una receta, buscar una incapacidad/consulta con ese código.
  let leave: any = null
  if (!prescription) {
    const { data } = await supabaseAdmin
      .from('consultations')
      .select(`
        id, created_at, medical_leave, reason_for_visit, verification_code,
        clinics ( name ),
        patients ( first_name, last_name ),
        user_profiles!doctor_id ( first_name, last_name, specialty, gender, practice_name )
      `)
      .eq('verification_code', code)
      .single()
    leave = data
  }

  const doc: any = prescription || leave
  const isValid = !!doc
  const isLeave = !prescription && !!leave

  const patient = doc?.patients
  const docDoctor = doc?.user_profiles

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: '600px', width: '100%', backgroundColor: '#ffffff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ backgroundColor: isValid ? '#0d9488' : '#dc2626', padding: '2rem', textAlign: 'center', color: 'white' }}>
          {isValid ? (
            <CheckCircle size={64} style={{ margin: '0 auto 1rem' }} />
          ) : (
            <AlertCircle size={64} style={{ margin: '0 auto 1rem' }} />
          )}
          <h1 style={{ margin: '0', fontSize: '1.5rem', fontWeight: 600 }}>
            {!isValid
              ? 'Documento No Encontrado o Inválido'
              : isLeave ? 'Incapacidad Médica Auténtica' : 'Receta Médica Auténtica'}
          </h1>
          {isValid && (
            <p style={{ margin: '0.5rem 0 0', opacity: 0.9 }}>
              Emitida el {formatDateHN(doc.created_at)}
            </p>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: '2rem' }}>
          {!isValid ? (
            <div style={{ textAlign: 'center', color: '#64748b' }}>
              <p>El código de verificación proporcionado no existe en nuestra base de datos o el documento ha sido revocado.</p>
              <p style={{ marginTop: '1rem', fontWeight: 500 }}>Código ingresado: {code}</p>
            </div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                <div>
                  <h3 style={{ fontSize: '0.875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <User size={16} /> Paciente
                  </h3>
                  <p style={{ margin: '0', fontWeight: 500, color: '#0f172a' }}>{patient?.first_name} {patient?.last_name}</p>
                </div>

                <div>
                  <h3 style={{ fontSize: '0.875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Stethoscope size={16} /> Médico
                  </h3>
                  <p style={{ margin: '0', fontWeight: 500, color: '#0f172a' }}>{doctorTitle(docDoctor?.gender)} {docDoctor?.first_name} {docDoctor?.last_name}</p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>{docDoctor?.specialty || 'Medicina General'}</p>
                </div>
              </div>

              {isLeave ? (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem', marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1rem', color: '#0f172a', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ClipboardList size={20} color="#0d9488" /> Incapacidad Médica
                  </h3>
                  <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1rem', color: '#0f172a' }}>
                    {leave.medical_leave && String(leave.medical_leave).trim() !== ''
                      ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{leave.medical_leave}</p>
                      : <p style={{ margin: 0, color: '#64748b' }}>Constancia de consulta médica.</p>}
                    {leave.reason_for_visit && (
                      <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>Motivo: {leave.reason_for_visit}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem', marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1rem', color: '#0f172a', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FileText size={20} color="#0d9488" /> Medicamentos Recetados
                  </h3>
                  <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    {(prescription!.medicines as any[]).map((med, idx) => (
                      <div key={idx} style={{ padding: '1rem', borderBottom: idx !== (prescription!.medicines as any[]).length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                        <p style={{ margin: '0 0 0.25rem', fontWeight: 600, color: '#0f172a' }}>{med.name} {med.dose}</p>
                        <p style={{ margin: '0', fontSize: '0.875rem', color: '#64748b' }}>{med.frequency} por {med.duration}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ textAlign: 'center', fontSize: '0.875rem', color: '#94a3b8' }}>
                <p style={{ margin: '0 0 0.25rem' }}>{docDoctor?.practice_name || doc.clinics?.name}</p>
                <p style={{ margin: '0' }}>Verificado mediante CloudMedHN</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
