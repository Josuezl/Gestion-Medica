import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import PrintControlBar from './PrintControlBar'

interface PageProps {
  params: Promise<{ id: string }>
}

function calculateAge(birthDateString: string) {
  const today = new Date()
  const birthDate = new Date(birthDateString)
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
  return age
}

export default async function PrintPrescriptionPage({ params }: PageProps) {
  const resolvedParams = await params
  const prescriptionId = resolvedParams.id

  const supabase = await createClient()

  // 1. Validar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // 2. Cargar perfil del médico actual
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile) return notFound()

  // 3. Cargar la receta médica
  const { data: prescription, error: prescError } = await supabase
    .from('prescriptions')
    .select('*')
    .eq('id', prescriptionId)
    .single()

  if (prescError || !prescription) {
    return notFound()
  }

  // 4. Validar seguridad multi-inquilino (tenant isolation)
  if (prescription.clinic_id !== profile.clinic_id) {
    return notFound()
  }

  // 5. Cargar datos relacionados en paralelo
  const [patientRes, doctorRes, clinicRes, consultRes] = await Promise.all([
    supabase.from('patients').select('*').eq('id', prescription.patient_id).single(),
    supabase.from('user_profiles').select('*').eq('id', prescription.doctor_id).single(),
    supabase.from('clinics').select('*').eq('id', prescription.clinic_id).single(),
    supabase.from('consultations').select('*').eq('id', prescription.consultation_id).single()
  ])

  const patient = patientRes.data
  const doctor = doctorRes.data
  const clinic = clinicRes.data
  const consultation = consultRes.data

  if (!patient || !doctor || !clinic) {
    return notFound()
  }

  const patientAge = calculateAge(patient.birth_date)
  const formattedDate = new Date(prescription.created_at).toLocaleDateString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })

  const docName = `Dr. ${doctor.first_name} ${doctor.last_name}`
  const docSpecialty = doctor.specialty || 'Medicina General'
  const docProfessionalId = doctor.professional_id || 'N/A'

  // Formatear sexo en español
  const getGenderText = (g: string) => {
    if (g === 'M') return 'Masculino'
    if (g === 'F') return 'Femenino'
    return 'Otro'
  }

  return (
    <>
      {/* Estilos específicos y tipografías */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        
        body {
          background-color: #f1f5f9;
          margin: 0;
          padding: 0;
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .control-bar {
          background-color: #0f172a;
          color: white;
          padding: 12px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 1000;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        
        .control-title {
          font-family: 'Outfit', sans-serif;
          font-size: 16px;
          font-weight: 600;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .control-buttons {
          display: flex;
          gap: 12px;
        }
        
        .btn-print {
          background: linear-gradient(135deg, #0d9488, #0f766e);
          color: white;
          border: none;
          padding: 8px 18px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 2px 4px rgba(13, 148, 136, 0.2);
          transition: all 0.2s;
        }
        .btn-print:hover {
          opacity: 0.95;
          transform: translateY(-1px);
        }
        
        .btn-close {
          background-color: transparent;
          color: #94a3b8;
          border: 1px solid #475569;
          padding: 8px 18px;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }
        .btn-close:hover {
          color: white;
          border-color: #94a3b8;
          background-color: rgba(255,255,255,0.05);
        }
        
        .prescription-sheet {
          width: 210mm;
          min-height: 297mm;
          margin: 30px auto;
          background-color: white;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
          border-radius: 12px;
          padding: 22mm 20mm;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
        }
        
        .header-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
        }
        
        .clinic-name {
          font-family: 'Outfit', sans-serif;
          font-size: 26px;
          font-weight: 800;
          color: #0f172a;
          margin: 0 0 6px 0;
          letter-spacing: -0.025em;
        }
        
        .clinic-detail {
          font-size: 11.5px;
          color: #64748b;
          margin: 2px 0;
          line-height: 1.4;
        }
        
        .doctor-name {
          font-family: 'Outfit', sans-serif;
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 4px 0;
          letter-spacing: -0.01em;
        }
        
        .doctor-specialty {
          font-size: 13px;
          color: #0d9488;
          font-weight: 600;
          margin: 0 0 4px 0;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .doctor-detail {
          font-size: 11px;
          color: #64748b;
          margin: 2px 0;
        }
        
        .divider {
          height: 3px;
          background: linear-gradient(90deg, #0d9488, #0f766e);
          border-radius: 2px;
          margin: 15px 0 22px 0;
        }
        
        .patient-card {
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 16px 20px;
          margin-bottom: 25px;
        }
        
        .patient-grid {
          display: grid;
          grid-template-columns: 1.5fr 1fr;
          gap: 12px 24px;
        }
        
        .info-item {
          display: flex;
          flex-direction: column;
        }
        
        .info-label {
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.05em;
          margin-bottom: 3px;
        }
        
        .info-val {
          font-weight: 600;
          color: #1e293b;
          font-size: 13px;
        }
        
        .vitals-row {
          grid-column: span 2;
          border-top: 1px dashed #e2e8f0;
          margin-top: 6px;
          padding-top: 12px;
          display: flex;
          gap: 15px;
          flex-wrap: wrap;
        }
        
        .vital-badge {
          background-color: white;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 5px 10px;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          color: #475569;
        }
        
        .vital-badge strong {
          color: #0f172a;
          font-weight: 600;
        }
        
        .vital-icon {
          width: 14px;
          height: 14px;
          color: #0d9488;
          flex-shrink: 0;
        }
        
        .rp-container {
          flex: 1;
          margin-bottom: 30px;
        }

        .rp-header {
          font-family: 'Outfit', sans-serif;
          font-size: 28px;
          font-style: italic;
          font-weight: 800;
          color: #0d9488;
          margin: 0 0 12px 0;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .medicines-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 25px;
        }
        
        .medicines-table th {
          text-align: left;
          padding: 8px 12px;
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 2px solid #e2e8f0;
        }
        
        .medicines-table td {
          padding: 12px 12px;
          font-size: 13px;
          color: #334155;
          border-bottom: 1px solid #f1f5f9;
        }
        
        .med-name {
          font-weight: 700;
          color: #0f172a;
        }
        
        .med-desc {
          color: #475569;
          font-size: 13px;
        }
        
        .indications-section {
          margin-top: 15px;
          margin-bottom: 30px;
        }
        
        .indications-title {
          font-size: 10px;
          font-weight: 700;
          color: #0d9488;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 6px;
        }
        
        .indications-body {
          font-size: 12.5px;
          color: #334155;
          line-height: 1.5;
          background-color: rgba(13, 148, 136, 0.02);
          border-left: 3px solid #0d9488;
          padding: 8px 12px;
          border-radius: 0 6px 6px 0;
          white-space: pre-line;
        }
        
        .footer-section {
          border-top: 1px solid #e2e8f0;
          padding-top: 20px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 40px;
        }
        
        .validation-block {
          max-width: 380px;
        }
        
        .validation-title {
          font-size: 9px;
          font-weight: 800;
          color: #94a3b8;
          letter-spacing: 0.05em;
          margin-bottom: 4px;
          text-transform: uppercase;
        }
        
        .validation-code {
          font-family: monospace;
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 4px;
        }
        
        .validation-text {
          font-size: 10.5px;
          color: #64748b;
          line-height: 1.4;
          margin: 0;
        }
        
        .signature-block {
          text-align: center;
          min-width: 200px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        
        .signature-line {
          border-top: 1px solid #cbd5e1;
          padding-top: 8px;
          width: 100%;
        }
        
        .sig-doc-name {
          font-weight: 700;
          font-size: 13px;
          color: #0f172a;
          margin: 0;
        }
        
        .sig-doc-spec {
          font-size: 11px;
          color: #64748b;
          margin: 1px 0 0 0;
        }
        
        .sig-doc-id {
          font-size: 10px;
          color: #64748b;
          margin: 1px 0 0 0;
        }
        
        /* Media Query de Impresión */
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background-color: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .prescription-sheet {
            width: 100% !important;
            max-width: 100% !important;
            height: 100vh !important;
            min-height: 100vh !important;
            margin: 0 !important;
            padding: 10mm 15mm !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            justify-content: space-between !important;
            box-sizing: border-box !important;
          }
          .patient-card {
            background-color: #fff !important;
            border: 1px solid #cbd5e1 !important;
          }
          .vital-badge {
            border: 1px solid #cbd5e1 !important;
            background-color: #fff !important;
          }
        }
      `}} />

      {/* Barra de Control Superior (No Imprimible) */}
      <PrintControlBar />

      {/* Receta Sheet */}
      <div className="prescription-sheet">
        {/* Encabezado */}
        <div>
          <table className="header-table">
            <tbody>
              <tr>
                <td style={{ verticalAlign: 'top', textAlign: 'left' }}>
                  <h1 className="clinic-name">{clinic.name}</h1>
                  <p className="clinic-detail">Teléfono: {clinic.phone || 'N/A'}</p>
                  <p className="clinic-detail">{clinic.address || 'Honduras'}</p>
                </td>
                <td style={{ verticalAlign: 'top', textAlign: 'right' }}>
                  <h2 className="doctor-name">{docName}</h2>
                  <p className="doctor-specialty">{docSpecialty}</p>
                  <p className="doctor-detail">Col. Médico: {docProfessionalId}</p>
                  {doctor.phone && <p className="doctor-detail">Contacto: {doctor.phone}</p>}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Línea Divisoria */}
          <div className="divider"></div>

          {/* Ficha de Información del Paciente */}
          <div className="patient-card">
            <div className="patient-grid">
              <div className="info-item">
                <span className="info-label">Paciente</span>
                <span className="info-val" style={{ fontSize: '15px' }}>
                  {patient.first_name} {patient.last_name}
                  {patient.is_pediatric && (
                    <span style={{ 
                      marginLeft: '10px', 
                      fontSize: '10px', 
                      backgroundColor: 'rgba(13, 148, 136, 0.1)', 
                      color: '#0d9488', 
                      padding: '2px 8px', 
                      borderRadius: '4px',
                      fontWeight: 700,
                      textTransform: 'uppercase'
                    }}>
                      Pediátrico
                    </span>
                  )}
                </span>
              </div>
              <div className="info-item" style={{ textAlign: 'right' }}>
                <span className="info-label">Fecha de Emisión</span>
                <span className="info-val">{formattedDate}</span>
              </div>
              
              <div className="info-item">
                <span className="info-label">Edad / Sexo / Identidad</span>
                <span className="info-val">
                  {patientAge} años &nbsp;•&nbsp; {getGenderText(patient.gender)} &nbsp;•&nbsp; DNI: {patient.id_card || 'N/A'}
                </span>
              </div>

              {patient.is_pediatric && (patient.father_name || patient.mother_name) && (
                <div className="info-item" style={{ textAlign: 'right' }}>
                  <span className="info-label">Responsables</span>
                  <span className="info-val" style={{ fontSize: '11.5px', color: '#475569' }}>
                    {patient.mother_name && `Madre: ${patient.mother_name}`}
                    {patient.mother_name && patient.father_name && ' / '}
                    {patient.father_name && `Padre: ${patient.father_name}`}
                  </span>
                </div>
              )}

              {patient.allergies && patient.allergies !== 'Ninguna' && patient.allergies !== 'Ninguna conocida' && (
                <div className="info-item" style={{ gridColumn: 'span 2', marginTop: '4px' }}>
                  <span className="info-label" style={{ color: '#e11d48' }}>Alergias</span>
                  <span className="info-val" style={{ color: '#e11d48', fontWeight: 700 }}>{patient.allergies}</span>
                </div>
              )}

              {/* Fila de Constantes Vitales (Si están disponibles en la consulta) */}
              {consultation && (
                consultation.weight || consultation.blood_pressure || consultation.temperature || consultation.heart_rate || (consultation as any).height
              ) && (
                <div className="vitals-row">
                  {consultation.weight && (
                    <div className="vital-badge">
                      <svg className="vital-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 2v20"/><path d="M2 12h20"/></svg>
                      <span>Peso: <strong>{consultation.weight} kg</strong></span>
                    </div>
                  )}
                  {(consultation as any).height && (
                    <div className="vital-badge">
                      <svg className="vital-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
                      <span>Talla: <strong>{(consultation as any).height} cm</strong></span>
                    </div>
                  )}
                  {consultation.blood_pressure && (
                    <div className="vital-badge">
                      <svg className="vital-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                      <span>P. Arterial: <strong>{consultation.blood_pressure}</strong></span>
                    </div>
                  )}
                  {consultation.temperature && (
                    <div className="vital-badge">
                      <svg className="vital-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/></svg>
                      <span>Temp: <strong>{consultation.temperature} °C</strong></span>
                    </div>
                  )}
                  {consultation.heart_rate && (
                    <div className="vital-badge">
                      <svg className="vital-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                      <span>F. Cardíaca: <strong>{consultation.heart_rate} bpm</strong></span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Rp. Receta */}
          <div className="rp-container">
            <h3 className="rp-header">
              <span>Rp.</span>
              <span style={{ fontSize: '13px', fontStyle: 'normal', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: '5px' }}>
                Prescripción Médica
              </span>
            </h3>

            <table className="medicines-table">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Medicamento</th>
                  <th style={{ width: '60%' }}>Indicación / Dosis / Frecuencia / Duración</th>
                </tr>
              </thead>
              <tbody>
                {(prescription.medicines || []).map((med: any, index: number) => (
                  <tr key={index}>
                    <td>
                      <span className="med-name">{index + 1}. {med.name}</span>
                    </td>
                    <td>
                      <span className="med-desc">
                        {med.dose || ''} {med.frequency ? `• ${med.frequency}` : ''} {med.duration ? `• ${med.duration}` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Indicaciones Generales */}
            {prescription.notes && (
              <div className="indications-section">
                <h4 className="indications-title">Indicaciones Generales y Recomendaciones</h4>
                <div className="indications-body">
                  {prescription.notes}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pie de Receta: Sello y Validación */}
        <div className="footer-section">
          {/* Bloque de validación electrónica */}
          <div className="validation-block">
            <h5 className="validation-title">Receta Médica Verificada Electrónicamente</h5>
            <div className="validation-code">Código: {prescription.verification_code}</div>
            <p className="validation-text">
              Esta receta ha sido emitida de forma electrónica por un profesional de la salud debidamente autorizado y certificado. 
              El código impreso arriba es único y puede utilizarse para validar la integridad del documento en farmacias.
            </p>
          </div>

          {/* Firma Médica */}
          <div className="signature-block">
            {doctor.signature_url ? (
              <>
                <img 
                  src={doctor.signature_url} 
                  alt="Firma Digital" 
                  style={{ maxHeight: '70px', maxWidth: '200px', objectFit: 'contain', marginBottom: '5px' }} 
                />
                <div className="signature-line">
                  <p className="sig-doc-name">{docName}</p>
                  <p className="sig-doc-spec">{docSpecialty}</p>
                  <p className="sig-doc-id">Col. Médico: {docProfessionalId}</p>
                  <p style={{ fontSize: '9px', color: '#94a3b8', margin: '3px 0 0 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Firma Digital / Sello Electrónico</p>
                </div>
              </>
            ) : (
              <>
                <div style={{ height: '70px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {/* Espacio para sello físico o firma manuscrita */}
                  <span style={{ fontSize: '10px', color: '#cbd5e1', fontStyle: 'italic' }}>Sello y Firma Física</span>
                </div>
                <div className="signature-line">
                  <p className="sig-doc-name">{docName}</p>
                  <p className="sig-doc-spec">{docSpecialty}</p>
                  <p className="sig-doc-id">Col. Médico: {docProfessionalId}</p>
                  <p style={{ fontSize: '9px', color: '#94a3b8', margin: '3px 0 0 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Firma Autorizada</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
