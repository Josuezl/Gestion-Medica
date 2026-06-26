import React from 'react'
import { createClient } from '@supabase/supabase-js'
import { CheckCircle, AlertCircle, FileText, User, Stethoscope, ClipboardList, FlaskConical } from 'lucide-react'
import { formatDateHN } from '@/utils/datetime'
import { doctorTitle } from '@/utils/doctorName'
import { medicineDetail } from '@/utils/medicines'

// Página PÚBLICA: usa el cliente service_role porque RLS bloquea el acceso anónimo.
// Se instancia DENTRO del componente (no a nivel de módulo) para no romper el build.
// Resuelve dos tipos de documento por su código: recetas e incapacidades (consultas).
export default async function VerifyDocumentPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams?: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { code } = await params
  const sp = searchParams ? await searchParams : {}
  // ?doc=referral muestra la consulta como Referencia Médica (Motivo de consulta + Motivo de referencia).
  const wantReferral = sp?.doc === 'referral'

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
        id, created_at, medical_leave, referral, reason_for_visit, verification_code,
        clinics ( name ),
        patients ( first_name, last_name ),
        user_profiles!doctor_id ( first_name, last_name, specialty, gender, practice_name )
      `)
      .eq('verification_code', code)
      .single()
    leave = data
  }

  // Si no es receta ni incapacidad, buscar una orden de laboratorio con ese código.
  let labOrder: any = null
  if (!prescription && !leave) {
    const { data } = await supabaseAdmin
      .from('lab_orders')
      .select(`
        id, created_at, tests, other_tests, verification_code,
        clinics ( name ),
        patients ( first_name, last_name ),
        user_profiles!doctor_id ( first_name, last_name, specialty, gender, practice_name )
      `)
      .eq('verification_code', code)
      .single()
    labOrder = data
  }

  // Si no es receta, incapacidad ni orden de laboratorio, buscar una solicitud de estudios.
  let studyRequest: any = null
  if (!prescription && !leave && !labOrder) {
    const { data } = await supabaseAdmin
      .from('study_requests')
      .select(`
        id, created_at, studies, other_studies, verification_code,
        clinics ( name ),
        patients ( first_name, last_name ),
        user_profiles!doctor_id ( first_name, last_name, specialty, gender, practice_name )
      `)
      .eq('verification_code', code)
      .single()
    studyRequest = data
  }

  const doc: any = prescription || leave || labOrder || studyRequest
  const isValid = !!doc
  const isReferral = !prescription && !!leave && wantReferral
  const isLeave = !prescription && !!leave && !wantReferral
  const isLabOrder = !prescription && !leave && !!labOrder
  const isStudyRequest = !prescription && !leave && !labOrder && !!studyRequest

  const patient = doc?.patients
  const docDoctor = doc?.user_profiles

  // Exámenes de la orden, agrupados por categoría (para mostrarlos en la verificación).
  const labTests: { category: string; name: string }[] = isLabOrder && Array.isArray(labOrder.tests) ? labOrder.tests : []
  const labGroups: { category: string; names: string[] }[] = []
  for (const t of labTests) {
    let g = labGroups.find((x) => x.category === t.category)
    if (!g) { g = { category: t.category, names: [] }; labGroups.push(g) }
    g.names.push(t.name)
  }
  const labOtherLines = isLabOrder ? (labOrder.other_tests || '').split('\n').map((s: string) => s.trim()).filter(Boolean) : []

  // Estudios de la solicitud, agrupados por sección (para mostrarlos en la verificación).
  const studyItems: { section: string; name: string; indication?: string | null }[] = isStudyRequest && Array.isArray(studyRequest.studies) ? studyRequest.studies : []
  const studyGroups: { section: string; names: string[] }[] = []
  for (const s of studyItems) {
    let g = studyGroups.find((x) => x.section === s.section)
    if (!g) { g = { section: s.section, names: [] }; studyGroups.push(g) }
    g.names.push(s.name)
  }
  const studyOtherLines = isStudyRequest ? (studyRequest.other_studies || '').split('\n').map((s: string) => s.trim()).filter(Boolean) : []

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
              : isReferral ? 'Referencia Médica Auténtica'
              : isLeave ? 'Incapacidad Médica Auténtica'
              : isLabOrder ? 'Orden de Laboratorio Auténtica'
              : isStudyRequest ? 'Solicitud de Estudios Auténtica'
              : 'Receta Médica Auténtica'}
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

              {isReferral ? (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem', marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1rem', color: '#0f172a', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ClipboardList size={20} color="#0d9488" /> Referencia Médica
                  </h3>
                  <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1rem', color: '#0f172a' }}>
                    {leave.reason_for_visit && (
                      <p style={{ margin: '0 0 0.75rem' }}><strong style={{ color: '#64748b', fontWeight: 600 }}>Motivo de consulta:</strong> {leave.reason_for_visit}</p>
                    )}
                    {leave.referral && String(leave.referral).trim() !== ''
                      ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}><strong style={{ color: '#64748b', fontWeight: 600 }}>Motivo de referencia:</strong> {leave.referral}</p>
                      : <p style={{ margin: 0, color: '#64748b' }}>Referencia médica.</p>}
                  </div>
                </div>
              ) : isLeave ? (
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
              ) : isLabOrder ? (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem', marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1rem', color: '#0f172a', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FlaskConical size={20} color="#0d9488" /> Exámenes Solicitados
                  </h3>
                  <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1rem', color: '#0f172a' }}>
                    {labGroups.map((g) => (
                      <div key={g.category} style={{ marginBottom: '0.85rem' }}>
                        <p style={{ margin: '0 0 0.25rem', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0d9488' }}>{g.category}</p>
                        <p style={{ margin: 0, fontSize: '0.9rem' }}>{g.names.join(' · ')}</p>
                      </div>
                    ))}
                    {labOtherLines.length > 0 && (
                      <div>
                        <p style={{ margin: '0 0 0.25rem', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Otros</p>
                        <p style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'pre-line' }}>{labOtherLines.join('\n')}</p>
                      </div>
                    )}
                    {labGroups.length === 0 && labOtherLines.length === 0 && (
                      <p style={{ margin: 0, color: '#64748b' }}>Sin exámenes especificados.</p>
                    )}
                  </div>
                </div>
              ) : isStudyRequest ? (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem', marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1rem', color: '#0f172a', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Stethoscope size={20} color="#0d9488" /> Estudios Solicitados
                  </h3>
                  <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1rem', color: '#0f172a' }}>
                    {studyGroups.map((g) => (
                      <div key={g.section} style={{ marginBottom: '0.85rem' }}>
                        <p style={{ margin: '0 0 0.25rem', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0d9488' }}>{g.section}</p>
                        <p style={{ margin: 0, fontSize: '0.9rem' }}>{g.names.join(' · ')}</p>
                      </div>
                    ))}
                    {studyOtherLines.length > 0 && (
                      <div>
                        <p style={{ margin: '0 0 0.25rem', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Otros</p>
                        <p style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'pre-line' }}>{studyOtherLines.join('\n')}</p>
                      </div>
                    )}
                    {studyGroups.length === 0 && studyOtherLines.length === 0 && (
                      <p style={{ margin: 0, color: '#64748b' }}>Sin estudios especificados.</p>
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
                        <p style={{ margin: '0 0 0.25rem', fontWeight: 600, color: '#0f172a' }}>{idx + 1}. {med.name}</p>
                        {medicineDetail(med) && (
                          <p style={{ margin: '0', fontSize: '0.875rem', color: '#64748b' }}>{medicineDetail(med)}</p>
                        )}
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
