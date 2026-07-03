import React from 'react'
import QRCode from 'qrcode'
import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import CodeForm from './CodeForm'
import PatientControlBar from './PatientControlBar'
import { doctorShortName } from '@/utils/doctorName'
import { formatDateTimeHN } from '@/utils/datetime'
import { medicineDetail } from '@/utils/medicines'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ code?: string }>
}

function calculateAge(birthDateString: string) {
  const today = new Date()
  const birthDate = new Date(birthDateString)
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
  return age
}

export default async function ViewPrescriptionPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params
  const resolvedSearchParams = searchParams ? await searchParams : {}
  
  let prescriptionId = resolvedParams.id
  let inputCode = resolvedSearchParams.code?.trim().toUpperCase() || ''

  // Reemplazar guiones largos (en-dash y em-dash) por guión estándar
  inputCode = inputCode.replace(/[\u2013\u2014]/g, '-')

  // Sanitización ultra-resiliente para extraer UUID y Código de acceso si se concatenaron
  const uuidRegex = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  const uuidMatch = prescriptionId.match(uuidRegex)
  
  if (uuidMatch) {
    prescriptionId = uuidMatch[1]
    
    if (!inputCode) {
      const codeRegex = /(MC-[\u2013\u2014A-Z0-9]{8,12})/i
      const decodedId = decodeURIComponent(resolvedParams.id)
      const codeMatch = decodedId.match(codeRegex)
      if (codeMatch) {
        inputCode = codeMatch[1].toUpperCase().replace(/[\u2013\u2014]/g, '-')
      }
    }
  }

  // Usamos el cliente service_role porque esta ruta es PÚBLICA y RLS bloquea el acceso anónimo a recetas.
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Cargar la receta médica
  const { data: prescription, error: prescError } = await supabaseAdmin
    .from('prescriptions')
    .select('*')
    .eq('id', prescriptionId)
    .single()

  if (prescError || !prescription) {
    return notFound()
  }

  // 2. Verificar correspondencia del código (ignorando guiones, espacios y mayúsculas/minúsculas)
  const cleanInput = inputCode.replace(/[\s\-–—]/g, '')
  const cleanDbCode = prescription.verification_code.toUpperCase().replace(/[\s\-–—]/g, '')
  const codeMatches = cleanInput && cleanInput === cleanDbCode

  // 3. Si no hay código o no coincide, renderizar pantalla de bloqueo
  if (!codeMatches) {
    // M4: con código incorrecto/ausente NO se revela el nombre de la clínica ni otros metadatos
    // (minimización de datos en página pública). Se muestra un portal neutro de ingreso de código.
    const hasError = !!inputCode // Si ingresó un código y no coincidió, es error

    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f1f5f9',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxSizing: 'border-box'
      }}>
        <div style={{
          maxWidth: '440px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.04)',
          border: '1px solid #e2e8f0',
          padding: '40px 30px',
          boxSizing: 'border-box',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          {/* Icono de Escudo / Candado */}
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(13, 148, 136, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            color: '#0d9488'
          }}>
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>

          <h3 style={{ margin: '0 0 6px 0', fontSize: '12px', fontWeight: 800, color: '#0d9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Portal de Pacientes
          </h3>
          <h1 style={{ margin: '0 0 12px 0', fontSize: '22px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Acceso Seguro a Receta
          </h1>
          <p style={{ margin: '0 0 24px 0', fontSize: '13.5px', color: '#64748b', lineHeight: 1.5 }}>
            Por motivos de privacidad y seguridad médica, por favor introduzca el código de acceso proporcionado por su médico para ver las indicaciones.
          </p>

          <CodeForm prescriptionId={prescriptionId} hasError={hasError} defaultValue={inputCode} />

          <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '30px', paddingTop: '20px', width: '100%', fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>
            <p style={{ margin: '0' }}>Esta página está protegida con cifrado SSL de extremo a extremo.</p>
            <p style={{ margin: '4px 0 0 0' }}>Desarrollado de conformidad con la ley de protección de datos médicos.</p>
          </div>
        </div>
      </div>
    )
  }

  // 4. Si el código coincide, cargar el resto de la información
  const [patientRes, doctorRes, clinicRes] = await Promise.all([
    supabaseAdmin.from('patients').select('*').eq('id', prescription.patient_id).single(),
    supabaseAdmin.from('user_profiles').select('*').eq('id', prescription.doctor_id).single(),
    supabaseAdmin.from('clinics').select('*').eq('id', prescription.clinic_id).single(),
  ])

  const patient = patientRes.data
  const doctor = doctorRes.data
  const clinic = clinicRes.data

  if (!patient || !doctor || !clinic) {
    return notFound()
  }

  const patientAge = calculateAge(patient.birth_date)
  const formattedDate = formatDateTimeHN(prescription.created_at)

  const docName = doctorShortName(doctor.first_name, doctor.last_name, doctor.gender)
  const docSpecialty = doctor.specialty || 'Medicina General'

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const qrDataUrl = await QRCode.toDataURL(`${SITE_URL}/verificar/${prescription.verification_code}`, { margin: 1, width: 240, errorCorrectionLevel: 'M' })

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

        .dx-block {
          margin-top: 14px;
          padding-bottom: 12px;
          border-bottom: 1px solid #e2e8f0;
        }
        .dx-block .dx-label {
          display: block;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.05em;
          margin-bottom: 3px;
        }
        .dx-block .dx-val {
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

        /* Estilos móviles adaptados para pantalla */
        @media (max-width: 220mm) {
          .prescription-sheet {
            width: 95% !important;
            margin: 20px auto !important;
            padding: 15px !important;
            min-height: auto !important;
          }
          .patient-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }
          .footer-section {
            flex-direction: column !important;
            align-items: center !important;
            gap: 25px !important;
            text-align: center !important;
          }
          .validation-block {
            max-width: 100% !important;
          }
          .info-item {
            text-align: left !important;
          }
        }
      `}} />

      {/* Barra de Control de Paciente (No Imprimible) */}
      <PatientControlBar />

      {/* Receta Sheet */}
      <div className="prescription-sheet">
        {/* Encabezado */}
        <div>
          <table className="header-table">
            <tbody>
              <tr>
                <td style={{ verticalAlign: 'top', textAlign: 'left' }}>
                  <h1 className="clinic-name">{doctor.practice_name || clinic.name}</h1>
                  <p className="clinic-detail">Teléfono: {doctor.practice_phone || clinic.phone || 'N/A'}</p>
                  <p className="clinic-detail">{doctor.practice_address || clinic.address || 'Honduras'}</p>
                </td>
                <td style={{ verticalAlign: 'top', textAlign: 'right' }}>
                  <h2 className="doctor-name">{docName}</h2>
                  <p className="doctor-specialty">{docSpecialty}</p>
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

            </div>
          </div>

          {/* Diagnóstico (opcional, lo exigen algunas aseguradoras) */}
          {prescription.diagnosis && (
            <div className="dx-block">
              <span className="dx-label">Diagnóstico</span>
              <span className="dx-val">{prescription.diagnosis}</span>
            </div>
          )}

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
                  <th>Medicamento</th>
                </tr>
              </thead>
              <tbody>
                {(prescription.medicines || []).map((med: any, index: number) => (
                  <tr key={index}>
                    <td>
                      <span className="med-name">{index + 1}. {med.name}</span>
                      {medicineDetail(med) && <span className="med-desc"> — {medicineDetail(med)}</span>}
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
          <div className="validation-block" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="Código QR de verificación de la receta" style={{ width: '92px', height: '92px', flexShrink: 0 }} />
            <div>
              <h5 className="validation-title">Receta Médica Verificada Electrónicamente</h5>
              <div className="validation-code">Código: {prescription.verification_code}</div>
              <p className="validation-text">
                Escanea el código QR o usa el código de arriba para validar esta receta en su versión digital.
                Documento emitido electrónicamente por un profesional autorizado.
              </p>
            </div>
          </div>

          {/* Firma Médica */}
          <div className="signature-block">
            {doctor.signature_url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- documento imprimible: la firma debe cargar siempre (sin lazy/optimizador) y viene de Storage */}
                <img
                  src={doctor.signature_url}
                  alt="Firma Digital"
                  style={{ maxHeight: '96px', maxWidth: '260px', objectFit: 'contain', marginBottom: '5px' }}
                />
                <div className="signature-line">
                  <p className="sig-doc-name">{docName}</p>
                  <p className="sig-doc-spec">{docSpecialty}</p>
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
