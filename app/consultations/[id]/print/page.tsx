import React from 'react'
import QRCode from 'qrcode'
import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import PrintControlBar from './PrintControlBar'
import { doctorShortName } from '@/utils/doctorName'
import { formatDateTimeHN } from '@/utils/datetime'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}

function calculateAge(birthDateString: string) {
  const today = new Date()
  const birthDate = new Date(birthDateString)
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
  return age
}

export default async function PrintConsultationSummaryPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params
  const consultationId = resolvedParams.id
  const resolvedSearchParams = searchParams ? await searchParams : {}
  // Modo "referencia": muestra solo Motivo de Consulta + Motivo de Referencia (en vez del resumen completo).
  const isReferral = resolvedSearchParams?.doc === 'referral'

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile) return notFound()

  const { data: consultation, error: cErr } = await supabase
    .from('consultations')
    .select('*')
    .eq('id', consultationId)
    .single()
  if (cErr || !consultation) return notFound()

  // Aislamiento multi-inquilino
  if (consultation.clinic_id !== profile.clinic_id) return notFound()

  const [patientRes, doctorRes, clinicRes] = await Promise.all([
    supabase.from('patients').select('*').eq('id', consultation.patient_id).single(),
    supabase.from('user_profiles').select('*').eq('id', consultation.doctor_id).single(),
    supabase.from('clinics').select('*').eq('id', consultation.clinic_id).single(),
  ])
  const patient = patientRes.data
  const doctor = doctorRes.data
  const clinic = clinicRes.data
  if (!patient || !doctor || !clinic) return notFound()

  const patientAge = calculateAge(patient.birth_date)
  const formattedDate = formatDateTimeHN(consultation.created_at)
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const verifyUrl = `${SITE_URL}/verificar/${consultation.verification_code}${isReferral ? '?doc=referral' : ''}`
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
  const docName = doctorShortName(doctor.first_name, doctor.last_name, doctor.gender)
  const docSpecialty = doctor.specialty || 'Medicina General'
  const logoUrl = (doctor as any).practice_logo_url || (clinic as any).logo_url
  // Si el médico usa SU PROPIO logo, este suele incluir su nombre/especialidad → se ocultan del
  // encabezado. Con el logo global de la clínica (o sin logo) sí se muestran.
  const usingOwnLogo = !!(doctor as any).practice_logo_url
  // Con el logo global de la clínica, acercar la línea de tel/dirección al logo (se ve muy separada).
  const isGlobalLogo = !!logoUrl && !usingOwnLogo
  const getGenderText = (g: string) => (g === 'M' ? 'Masculino' : g === 'F' ? 'Femenino' : 'Otro')

  const c: any = consultation
  const hc = c.head_circumference
  const hasVitals = c.weight || c.height || c.blood_pressure || c.temperature || c.heart_rate || c.respiratory_rate || c.oxygen_saturation || hc

  const sections = (isReferral
    ? [
        { title: 'Motivo de Consulta', value: c.reason_for_visit },
        { title: 'Motivo de Referencia', value: c.referral },
      ]
    : [
        // La incapacidad no imprime "Sintomatología / Anamnesis" (alargaba el documento a 2 páginas).
        // El dato sigue guardado en la consulta; solo se omite de este impreso.
        { title: 'Motivo de Consulta', value: c.reason_for_visit },
        { title: 'Diagnóstico', value: c.diagnosis },
        { title: 'Plan de Tratamiento / Recomendaciones', value: c.treatment_plan },
      ]
  ).filter(s => s.value && String(s.value).trim() !== '')
  // En referencia no se muestran vitales ni la incapacidad.
  const showVitals = hasVitals && !isReferral

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
        .sheet {
          width: 200mm; min-height: 277mm; background: #ffffff;
          padding: 14mm 16mm; box-shadow: 0 8px 30px rgba(15,23,42,0.12);
          display: flex; flex-direction: column;
        }

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

        /* Cabecera centrada (igual a la receta) */
        .header { text-align: center; }
        .header-logo { display: block; margin: 0 auto 4px; max-height: 125px; max-width: 70%; object-fit: contain; }
        .clinic-name { margin: 0; font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.01em; }
        .clinic-detail { margin: 3px 0 0; font-size: 10px; color: #64748b; }
        .doc-block { margin-top: 7px; }
        .doctor-name { margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; }
        .doctor-specialty { margin: 1px 0 0; font-size: 11px; font-weight: 600; color: #0d9488; }

        .doc-title { text-align: center; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #0d9488; margin: 12px 0 0; }
        .divider { height: 1px; background: #e2e8f0; margin: 10px 0 12px; }

        /* Paciente + vitales en línea (mismo formato que la receta) */
        .patient { background: #f8fafc; border: 1px solid #e9eef4; border-radius: 8px; padding: 9px 13px; }
        .prow { display: flex; justify-content: space-between; gap: 14px; }
        .prow + .prow { margin-top: 5px; }
        .plabel { font-size: 8.5px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; }
        .pval { font-size: 13px; font-weight: 600; color: #1e293b; }
        .ped-tag { margin-left: 8px; font-size: 9px; background: rgba(13,148,136,0.1); color: #0d9488; padding: 1px 7px; border-radius: 4px; font-weight: 700; text-transform: uppercase; }
        .vitals { display: flex; flex-wrap: wrap; gap: 5px 16px; margin-top: 7px; }
        .vital { font-size: 11px; color: #475569; }
        .vital strong { color: #0f172a; }

        /* Secciones clínicas */
        .body { flex: 1; margin-top: 16px; }
        .section { margin-bottom: 14px; }
        .section-title { font-size: 13px; font-weight: 700; color: #0d9488; margin: 0 0 5px; padding-bottom: 5px; border-bottom: 1px solid #e2e8f0; }
        .section-body { font-size: 12px; color: #334155; line-height: 1.55; margin: 0; white-space: pre-line; }

        /* Pie: QR + firma */
        .sign-area { margin-top: 26px; display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; }
        .qr-box { display: flex; align-items: center; gap: 12px; max-width: 300px; text-align: left; }
        .qr-box img { width: 84px; height: 84px; }
        .qr-cap-title { font-size: 11px; font-weight: 700; color: #0f172a; margin: 0; }
        .qr-cap-text { font-size: 9px; color: #64748b; margin: 2px 0 0; line-height: 1.3; }
        .qr-code { font-family: ui-monospace, monospace; font-size: 11px; font-weight: 700; color: #0d9488; margin: 4px 0 0; letter-spacing: 0.04em; }
        .sign { text-align: center; min-width: 200px; }
        .sign img { max-height: 135px; max-width: 340px; object-fit: contain; display: block; margin: 0 auto 4px; }
        .sign-empty { height: 74px; }
        .sign-line { border-top: 1px solid #334155; padding-top: 4px; }
        .sign-name { margin: 0; font-size: 12.5px; font-weight: 700; color: #0f172a; }
        .sign-spec { margin: 1px 0 0; font-size: 10px; color: #475569; }
        .sign-id { margin: 1px 0 0; font-size: 9.5px; color: #64748b; }

        @media print {
          body { background: #ffffff; }
          @page { size: A4; margin: 0; }
          .no-print { display: none !important; }
          .page-wrap { padding: 0; display: block; }
          .sheet { width: 210mm; min-height: 297mm; box-shadow: none; padding: 16mm 16mm; }
          .section { page-break-inside: avoid; }
          .patient { page-break-inside: avoid; }
          .sign-area { page-break-inside: avoid; }
        }
      `}} />

      <PrintControlBar />

      <div className="page-wrap">
        <div className="sheet">
          {/* Cabecera */}
          <div className="header">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="header-logo" src={logoUrl} alt="Logo" />
            ) : (
              <h1 className="clinic-name">{doctor.practice_name || clinic.name}</h1>
            )}
            <p className="clinic-detail" style={isGlobalLogo ? { marginTop: '-12px' } : undefined}>Tel: {doctor.practice_phone || clinic.phone || 'N/A'}&nbsp;&nbsp;•&nbsp;&nbsp;{doctor.practice_address || clinic.address || 'Honduras'}</p>
            {!usingOwnLogo && (
              <div className="doc-block">
                <h2 className="doctor-name">{docName}</h2>
                <p className="doctor-specialty">{docSpecialty}</p>
              </div>
            )}
          </div>

          <p className="doc-title">{isReferral ? 'Referencia Médica' : 'Incapacidad Médica'}</p>
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
                <span className="plabel">Fecha de la consulta</span>
                <span className="pval" style={{ fontSize: '12px' }}>{formattedDate}</span>
              </div>
            </div>
            <div className="prow">
              <div>
                <span className="plabel">Edad / Sexo / Identidad</span>
                <span className="pval" style={{ fontSize: '12px' }}>
                  {patientAge} años&nbsp;•&nbsp;{getGenderText(patient.gender)}&nbsp;•&nbsp;DNI: {patient.id_card || 'N/A'}
                </span>
              </div>
            </div>
            {showVitals && (
              <div className="vitals">
                {c.weight && <span className="vital">Peso: <strong>{c.weight} kg</strong></span>}
                {c.height && <span className="vital">Talla: <strong>{c.height} cm</strong></span>}
                {patient.is_pediatric && hc && <span className="vital">P. cefálico: <strong>{hc} cm</strong></span>}
                {c.blood_pressure && <span className="vital">P. Arterial: <strong>{c.blood_pressure}</strong></span>}
                {c.temperature && <span className="vital">Temp: <strong>{c.temperature} °C</strong></span>}
                {c.heart_rate && <span className="vital">F. Cardíaca: <strong>{c.heart_rate} bpm</strong></span>}
                {c.respiratory_rate && <span className="vital">F. Respiratoria: <strong>{c.respiratory_rate} rpm</strong></span>}
                {c.oxygen_saturation && <span className="vital">Saturación: <strong>{c.oxygen_saturation}%</strong></span>}
              </div>
            )}
          </div>

          {/* Secciones clínicas */}
          <div className="body">
            {sections.map((s) => (
              <div className="section" key={s.title}>
                <h3 className="section-title">{s.title}</h3>
                <p className="section-body">{s.value}</p>
              </div>
            ))}

            {!isReferral && c.medical_leave && String(c.medical_leave).trim() !== '' && (
              <div className="section">
                <h3 className="section-title">Incapacidad Médica</h3>
                <p className="section-body">{c.medical_leave}</p>
              </div>
            )}
          </div>

          {/* Pie: QR de verificación + firma */}
          <div className="sign-area">
            <div className="qr-box">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="Código QR de verificación del documento" />
              <div>
                <p className="qr-cap-title">Documento verificable</p>
                <p className="qr-cap-text">Escanea el código para validar este documento en su versión digital.</p>
                <p className="qr-code">{c.verification_code}</p>
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
