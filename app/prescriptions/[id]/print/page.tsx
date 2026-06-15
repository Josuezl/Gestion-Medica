import React from 'react'
import QRCode from 'qrcode'
import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import PrintControlBar from './PrintControlBar'
import { doctorShortName } from '@/utils/doctorName'

interface PageProps {
  params: Promise<{ id: string }>
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

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

  // 1. Autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 2. Perfil del médico actual
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile) return notFound()

  // 3. Receta
  const { data: prescription, error: prescError } = await supabase
    .from('prescriptions')
    .select('*')
    .eq('id', prescriptionId)
    .single()
  if (prescError || !prescription) return notFound()

  // 4. Aislamiento multi-inquilino
  if (prescription.clinic_id !== profile.clinic_id) return notFound()

  // 5. Datos relacionados
  const [patientRes, doctorRes, clinicRes] = await Promise.all([
    supabase.from('patients').select('*').eq('id', prescription.patient_id).single(),
    supabase.from('user_profiles').select('*').eq('id', prescription.doctor_id).single(),
    supabase.from('clinics').select('*').eq('id', prescription.clinic_id).single(),
  ])

  const patient = patientRes.data
  const doctor = doctorRes.data
  const clinic = clinicRes.data
  if (!patient || !doctor || !clinic) return notFound()

  const patientAge = calculateAge(patient.birth_date)
  const formattedDate = new Date(prescription.created_at).toLocaleDateString('es-HN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  })
  const docName = doctorShortName(doctor.first_name, doctor.last_name)
  const docSpecialty = doctor.specialty || 'Medicina General'
  const getGenderText = (g: string) => (g === 'M' ? 'Masculino' : g === 'F' ? 'Femenino' : 'Otro')

  // QR -> página pública de verificación de la receta
  const verifyUrl = `${SITE_URL}/verificar/${prescription.verification_code}`
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 240, errorCorrectionLevel: 'M' })

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        * { box-sizing: border-box; }
        body {
          background: #e2e8f0; margin: 0; padding: 0;
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #0f172a;
        }
        .page-wrap { display: flex; flex-direction: column; align-items: center; padding: 24px 12px 48px; }

        /* Media hoja: la receta ocupa la mitad superior de una A4 */
        .sheet {
          position: relative; width: 200mm; min-height: 143mm; background: #ffffff;
          padding: 9mm 11mm 8mm; box-shadow: 0 8px 30px rgba(15,23,42,0.12);
          display: flex; flex-direction: column;
        }

        /* Barra de control (no imprimible) */
        .control-bar {
          background: #0f172a; color: #fff; padding: 14px 28px;
          display: flex; justify-content: space-between; align-items: center;
          position: sticky; top: 0; z-index: 10; box-shadow: 0 2px 12px rgba(0,0,0,0.18);
        }
        .control-title { display: flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 700; margin: 0; }
        .control-buttons { display: flex; gap: 10px; }
        .btn-print {
          display: inline-flex; align-items: center; gap: 8px; background: #0d9488; color: #fff;
          border: none; padding: 10px 20px; border-radius: 9px; font-size: 13.5px; font-weight: 700;
          cursor: pointer; font-family: inherit; transition: background .15s, transform .1s;
        }
        .btn-print:hover { background: #0f766e; }
        .btn-print:active { transform: translateY(1px); }
        .btn-close {
          display: inline-flex; align-items: center; background: transparent; color: #cbd5e1;
          border: 1px solid #334155; padding: 10px 18px; border-radius: 9px; font-size: 13.5px;
          font-weight: 600; cursor: pointer; font-family: inherit; transition: background .15s, color .15s;
        }
        .btn-close:hover { background: #1e293b; color: #fff; }

        /* Cabecera (centrada: organización arriba, médico debajo) */
        .header { text-align: center; padding-top: 1mm; }
        .clinic-name { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.01em; }
        .clinic-detail { margin: 2px 0 0; font-size: 9.5px; color: #64748b; }
        .doc-block { margin-top: 6px; }
        .doctor-name { margin: 0; font-size: 14px; font-weight: 700; color: #0f172a; }
        .doctor-specialty { margin: 1px 0 0; font-size: 10px; font-weight: 600; color: #0d9488; }
        .doctor-detail { margin: 1px 0 0; font-size: 9px; color: #64748b; }

        .divider { height: 1px; background: #e2e8f0; margin: 6px 0 7px; }

        /* Paciente */
        .patient { background: #f8fafc; border: 1px solid #e9eef4; border-radius: 8px; padding: 7px 11px; }
        .prow { display: flex; justify-content: space-between; gap: 12px; }
        .prow + .prow { margin-top: 4px; }
        .plabel { font-size: 8px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; }
        .pval { font-size: 12px; font-weight: 600; color: #1e293b; }
        .ped-tag { margin-left: 8px; font-size: 9px; background: rgba(13,148,136,0.1); color: #0d9488; padding: 1px 7px; border-radius: 4px; font-weight: 700; text-transform: uppercase; }
        .allergy { color: #e11d48 !important; font-weight: 700; }
        .vitals { display: flex; flex-wrap: wrap; gap: 5px 14px; margin-top: 5px; }
        .vital { font-size: 10px; color: #475569; }
        .vital strong { color: #0f172a; }

        /* Rp */
        .rp { margin-top: 9px; flex: 1; }
        .rp-head { font-size: 17px; font-weight: 800; font-style: italic; color: #0d9488; margin: 0 0 5px; }
        .rp-head .rp-sub { font-style: normal; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-left: 6px; }
        .meds { width: 100%; border-collapse: collapse; }
        .meds th { text-align: left; font-size: 8px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0; padding: 0 0 3px; }
        .meds td { padding: 4px 0; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
        .med-name { font-size: 11.5px; font-weight: 700; color: #0f172a; }
        .med-desc { font-size: 11px; color: #475569; }
        .notes { margin-top: 7px; background: #fffbeb; border: 1px solid #fde68a; border-left: 3px solid #f59e0b; border-radius: 6px; padding: 6px 9px; }
        .notes-title { margin: 0 0 2px; font-size: 8.5px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: 0.04em; }
        .notes-body { font-size: 10.5px; color: #78350f; line-height: 1.4; white-space: pre-line; }

        /* Pie: QR + firma */
        .footer { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 8px; padding-top: 7px; border-top: 1px solid #e2e8f0; }
        .qr-box { display: flex; gap: 9px; align-items: center; }
        .qr-box img { width: 84px; height: 84px; display: block; }
        .qr-cap-title { font-size: 9px; font-weight: 700; color: #0f172a; margin: 0; }
        .qr-cap-text { font-size: 8.5px; color: #64748b; margin: 2px 0 0; max-width: 150px; line-height: 1.35; }
        .qr-code { font-size: 9px; font-weight: 700; color: #0d9488; margin: 3px 0 0; letter-spacing: 0.06em; }
        .sign { text-align: center; min-width: 200px; }
        .sign img { max-height: 56px; max-width: 190px; object-fit: contain; display: block; margin: 0 auto 3px; }
        .sign-empty { height: 50px; }
        .sign-line { border-top: 1px solid #334155; padding-top: 3px; }
        .sign-name { margin: 0; font-size: 11.5px; font-weight: 700; color: #0f172a; }
        .sign-spec { margin: 1px 0 0; font-size: 9.5px; color: #475569; }
        .sign-id { margin: 1px 0 0; font-size: 9px; color: #64748b; }

        @media print {
          body { background: #ffffff; }
          @page { size: A4; margin: 0; }
          .no-print { display: none !important; }
          .page-wrap { padding: 0; display: block; }
          .sheet { width: 210mm; min-height: 148.5mm; box-shadow: none; padding: 10mm 12mm 8mm; }
          .meds tr { page-break-inside: avoid; }
          .notes { page-break-inside: avoid; }
          .footer { page-break-inside: avoid; }
        }
      `}} />

      <PrintControlBar />

      <div className="page-wrap">
        <div className="sheet">
          {/* Cabecera centrada: organización arriba, médico debajo */}
          <div className="header">
            <h1 className="clinic-name">{clinic.name}</h1>
            <p className="clinic-detail">Tel: {clinic.phone || 'N/A'}&nbsp;&nbsp;•&nbsp;&nbsp;{clinic.address || 'Honduras'}</p>
            <div className="doc-block">
              <h2 className="doctor-name">{docName}</h2>
              <p className="doctor-specialty">{docSpecialty}</p>
            </div>
          </div>

          <div className="divider" />

          {/* Paciente */}
          <div className="patient">
            <div className="prow">
              <div>
                <span className="plabel">Paciente</span>
                <span className="pval">
                  {patient.first_name} {patient.last_name}
                  {patient.is_pediatric && <span className="ped-tag">Pediátrico</span>}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="plabel">Fecha de emisión</span>
                <span className="pval" style={{ fontSize: '11px' }}>{formattedDate}</span>
              </div>
            </div>
            <div className="prow">
              <div>
                <span className="plabel">Edad / Sexo / Identidad</span>
                <span className="pval" style={{ fontSize: '11px' }}>
                  {patientAge} años&nbsp;•&nbsp;{getGenderText(patient.gender)}&nbsp;•&nbsp;DNI: {patient.id_card || 'N/A'}
                </span>
              </div>
              {patient.is_pediatric && (patient.father_name || patient.mother_name) && (
                <div style={{ textAlign: 'right' }}>
                  <span className="plabel">Responsables</span>
                  <span className="pval" style={{ fontSize: '10.5px', color: '#475569' }}>
                    {patient.mother_name && `Madre: ${patient.mother_name}`}
                    {patient.mother_name && patient.father_name && ' · '}
                    {patient.father_name && `Padre: ${patient.father_name}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Rp */}
          <div className="rp">
            <h3 className="rp-head">Rp.<span className="rp-sub">Prescripción Médica</span></h3>
            <table className="meds">
              <thead>
                <tr>
                  <th style={{ width: '38%' }}>Medicamento</th>
                  <th style={{ width: '62%' }}>Dosis / Frecuencia / Duración</th>
                </tr>
              </thead>
              <tbody>
                {(prescription.medicines || []).map((med: any, index: number) => (
                  <tr key={index}>
                    <td><span className="med-name">{index + 1}. {med.name}</span></td>
                    <td>
                      <span className="med-desc">
                        {med.dose || ''} {med.frequency ? `• ${med.frequency}` : ''} {med.duration ? `• ${med.duration}` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {prescription.notes && (
              <div className="notes">
                <p className="notes-title">Indicaciones generales</p>
                <div className="notes-body">{prescription.notes}</div>
              </div>
            )}
          </div>

          {/* Pie: QR + firma */}
          <div className="footer">
            <div className="qr-box">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="Código QR de verificación de la receta" />
              <div>
                <p className="qr-cap-title">Receta verificable</p>
                <p className="qr-cap-text">Escanea el código para ver y validar esta receta en su versión digital.</p>
                <p className="qr-code">{prescription.verification_code}</p>
              </div>
            </div>

            <div className="sign">
              {doctor.signature_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={doctor.signature_url} alt="Firma" />
              ) : (
                <div className="sign-empty" />
              )}
              <div className="sign-line">
                <p className="sign-name">{docName}</p>
                <p className="sign-spec">{docSpecialty}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
