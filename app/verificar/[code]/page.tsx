import React from 'react'
import { createClient } from '@supabase/supabase-js'
import { CheckCircle, AlertCircle, FileText, User, Calendar, Stethoscope } from 'lucide-react'

// Usamos el cliente service_role porque esta ruta es PÚBLICA y RLS bloquea el acceso anónimo a recetas
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function VerifyPrescriptionPage({ params }: { params: { code: string } }) {
  const { code } = params

  const { data: prescription, error } = await supabaseAdmin
    .from('prescriptions')
    .select(`
      id,
      created_at,
      medicines,
      notes,
      verification_code,
      clinics (
        name,
        phone,
        address
      ),
      patients (
        first_name,
        last_name,
        id_card
      ),
      user_profiles!doctor_id (
        first_name,
        last_name,
        specialty,
        professional_id
      )
    `)
    .eq('verification_code', code)
    .single()

  const isValid = !error && prescription

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
            {isValid ? 'Receta Médica Auténtica' : 'Receta No Encontrada o Inválida'}
          </h1>
          {isValid && (
            <p style={{ margin: '0.5rem 0 0', opacity: 0.9 }}>
              Emitida el {new Date(prescription.created_at).toLocaleDateString('es-HN', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: '2rem' }}>
          {!isValid ? (
            <div style={{ textAlign: 'center', color: '#64748b' }}>
              <p>El código de verificación proporcionado no existe en nuestra base de datos o la receta ha sido revocada.</p>
              <p style={{ marginTop: '1rem', fontWeight: 500 }}>Código ingresado: {code}</p>
            </div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                <div>
                  <h3 style={{ fontSize: '0.875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <User size={16} /> Paciente
                  </h3>
                  <p style={{ margin: '0', fontWeight: 500, color: '#0f172a' }}>{(prescription.patients as any).first_name} {(prescription.patients as any).last_name}</p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>ID/DNI: {(prescription.patients as any).id_card || 'No registrado'}</p>
                </div>
                
                <div>
                  <h3 style={{ fontSize: '0.875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Stethoscope size={16} /> Médico
                  </h3>
                  <p style={{ margin: '0', fontWeight: 500, color: '#0f172a' }}>Dr/a. {(prescription.user_profiles as any).first_name} {(prescription.user_profiles as any).last_name}</p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>{(prescription.user_profiles as any).specialty || 'Medicina General'}</p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>Colegiación: {(prescription.user_profiles as any).professional_id || 'N/A'}</p>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem', marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1rem', color: '#0f172a', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText size={20} color="#0d9488" /> Medicamentos Recetados
                </h3>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  {(prescription.medicines as any[]).map((med, idx) => (
                    <div key={idx} style={{ padding: '1rem', borderBottom: idx !== (prescription.medicines as any[]).length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                      <p style={{ margin: '0 0 0.25rem', fontWeight: 600, color: '#0f172a' }}>{med.name} {med.dose}</p>
                      <p style={{ margin: '0', fontSize: '0.875rem', color: '#64748b' }}>{med.frequency} por {med.duration}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ textAlign: 'center', fontSize: '0.875rem', color: '#94a3b8' }}>
                <p style={{ margin: '0 0 0.25rem' }}>{(prescription.clinics as any).name}</p>
                <p style={{ margin: '0' }}>Verificado mediante CloudMedHN</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
