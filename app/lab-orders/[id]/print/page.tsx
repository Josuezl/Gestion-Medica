import React from 'react'
import QRCode from 'qrcode'
import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import PrintControlBar from './PrintControlBar'
import { doctorShortName } from '@/utils/doctorName'
import { formatDateTimeHN } from '@/utils/datetime'

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

export default async function PrintLabOrderPage({ params }: PageProps) {
  const { id } = await params
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

  // 3. Orden de laboratorio
  const { data: order, error: orderError } = await supabase
    .from('lab_orders')
    .select('*')
    .eq('id', id)
    .single()
  if (orderError || !order) return notFound()

  // 4. Aislamiento multi-inquilino
  if (order.clinic_id !== profile.clinic_id) return notFound()

  // 5. Datos relacionados
  const [patientRes, doctorRes, clinicRes] = await Promise.all([
    supabase.from('patients').select('*').eq('id', order.patient_id).single(),
    supabase.from('user_profiles').select('*').eq('id', order.doctor_id).single(),
    supabase.from('clinics').select('*').eq('id', order.clinic_id).single(),
  ])
  const patient = patientRes.data
  const doctor = doctorRes.data
  const clinic = clinicRes.data
  if (!patient || !doctor || !clinic) return notFound()

  const patientAge = calculateAge(patient.birth_date)
  const formattedDate = formatDateTimeHN(order.created_at)
  const docName = doctorShortName(doctor.first_name, doctor.last_name, doctor.gender)
  const docSpecialty = doctor.specialty || 'Medicina General'
  const logoUrl = (doctor as any).practice_logo_url || (clinic as any).logo_url
  // Si el médico usa SU PROPIO logo, este suele incluir su nombre/especialidad → se ocultan del
  // encabezado. Con el logo global de la clínica (o sin logo) sí se muestran.
  const usingOwnLogo = !!(doctor as any).practice_logo_url
  const getGenderText = (g: string) => (g === 'M' ? 'Masculino' : g === 'F' ? 'Femenino' : 'Otro')

  // Agrupar los exámenes solicitados por categoría conservando el orden.
  const tests: { category: string; name: string }[] = Array.isArray(order.tests) ? order.tests : []
  const grouped: { category: string; names: string[] }[] = []
  for (const t of tests) {
    let g = grouped.find((x) => x.category === t.category)
    if (!g) { g = { category: t.category, names: [] }; grouped.push(g) }
    g.names.push(t.name)
  }
  const otherLines = (order.other_tests || '').split('\n').map((s: string) => s.trim()).filter(Boolean)

  // QR -> página pública de verificación de la orden (igual que las recetas)
  let qrDataUrl: string | null = null
  if (order.verification_code) {
    const verifyUrl = `${SITE_URL}/verificar/${order.verification_code}`
    qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
  }

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
          position: relative; width: 200mm; min-height: 290mm; background: #ffffff;
          padding: 12mm 14mm 10mm; box-shadow: 0 8px 30px rgba(15,23,42,0.12);
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
          font-weight: 600; cursor: pointer; font-family: inherit;
        }
        .btn-close:hover { background: #1e293b; color: #fff; }

        /* Título */
        .title-box { text-align: center; margin-bottom: 8px; }
        .title-box span {
          display: inline-block; border: 2px solid #1e3a5f; border-radius: 8px;
          padding: 5px 26px; font-size: 18px; font-weight: 800; letter-spacing: 0.04em; color: #1e3a5f;
        }

        /* Cabecera clínica/médico */
        .header { text-align: center; }
        .header-logo { display: block; margin: 0 auto 4px; max-height: 125px; max-width: 70%; object-fit: contain; }
        .clinic-name { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.01em; }
        .clinic-detail { margin: 2px 0 0; font-size: 9.5px; color: #64748b; }
        .doc-block { margin-top: 5px; }
        .doctor-name { margin: 0; font-size: 13px; font-weight: 700; color: #0f172a; }
        .doctor-specialty { margin: 1px 0 0; font-size: 10px; font-weight: 600; color: #0d9488; }
        .divider { height: 1px; background: #e2e8f0; margin: 7px 0 8px; }

        /* Paciente */
        .patient { background: #f8fafc; border: 1px solid #e9eef4; border-radius: 8px; padding: 8px 12px; }
        .prow { display: flex; justify-content: space-between; gap: 12px; }
        .prow + .prow { margin-top: 5px; }
        .plabel { font-size: 8px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; }
        .pval { font-size: 12px; font-weight: 600; color: #1e293b; }
        .ped-tag { margin-left: 8px; font-size: 9px; background: rgba(13,148,136,0.1); color: #0d9488; padding: 1px 7px; border-radius: 4px; font-weight: 700; text-transform: uppercase; }

        /* Cuerpo: exámenes solicitados por categoría */
        .body { margin-top: 12px; flex: 1; }
        .body-title { font-size: 12px; font-weight: 800; color: #0d9488; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px; }
        .cats { column-count: 3; column-gap: 18px; }
        .cat { break-inside: avoid; margin-bottom: 12px; display: inline-block; width: 100%; }
        .cat-name { font-size: 9.5px; font-weight: 800; color: #1e3a5f; text-transform: uppercase; letter-spacing: 0.03em; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; margin-bottom: 4px; }
        .test { font-size: 11px; color: #0f172a; padding: 1.5px 0; display: flex; gap: 6px; align-items: flex-start; }
        .test::before { content: '✓'; color: #0d9488; font-weight: 800; font-size: 11px; line-height: 1.3; }
        .empty { font-size: 12px; color: #64748b; }

        .others { margin-top: 10px; padding: 8px 11px; background: #f8fafc; border: 1px solid #e9eef4; border-radius: 8px; }
        .others-title { font-size: 8.5px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 3px; }
        .others-body { font-size: 11px; color: #0f172a; line-height: 1.5; white-space: pre-line; }

        /* Pie: QR + firma (estándar de los documentos) */
        .footer { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 16px; padding-top: 9px; border-top: 1px solid #e2e8f0; }
        .qr-box { display: flex; gap: 9px; align-items: center; }
        .qr-box img { width: 84px; height: 84px; display: block; }
        .qr-cap-title { font-size: 9px; font-weight: 700; color: #0f172a; margin: 0; }
        .qr-cap-text { font-size: 8.5px; color: #64748b; margin: 2px 0 0; max-width: 150px; line-height: 1.35; }
        .qr-code { font-size: 9px; font-weight: 700; color: #0d9488; margin: 3px 0 0; letter-spacing: 0.06em; }
        .sign { text-align: center; min-width: 230px; }
        .sign img { max-height: 135px; max-width: 340px; object-fit: contain; display: block; margin: 0 auto 4px; }
        .sign-empty { height: 56px; }
        .sign-line { border-top: 1px solid #334155; padding-top: 3px; }
        .sign-name { margin: 0; font-size: 11.5px; font-weight: 700; color: #0f172a; }
        .sign-spec { margin: 1px 0 0; font-size: 9.5px; color: #475569; }

        @media print {
          body { background: #ffffff; }
          @page { size: A4; margin: 0; }
          .no-print { display: none !important; }
          .page-wrap { padding: 0; display: block; }
          .sheet { width: 210mm; min-height: 297mm; box-shadow: none; padding: 14mm 16mm; }
          .cat { page-break-inside: avoid; }
          .footer { page-break-inside: avoid; }
        }
      `}} />

      <PrintControlBar />

      <div className="page-wrap">
        <div className="sheet">
          <div className="title-box"><span>ORDEN DE LABORATORIO</span></div>

          {/* Cabecera: organización + médico */}
          <div className="header">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="header-logo" src={logoUrl} alt="Logo" />
            ) : (
              <h1 className="clinic-name">{doctor.practice_name || clinic.name}</h1>
            )}
            <p className="clinic-detail">Tel: {doctor.practice_phone || clinic.phone || 'N/A'}&nbsp;&nbsp;•&nbsp;&nbsp;{doctor.practice_address || clinic.address || 'Honduras'}</p>
            {!usingOwnLogo && (
              <div className="doc-block">
                <h2 className="doctor-name">{docName}</h2>
                <p className="doctor-specialty">{docSpecialty}</p>
              </div>
            )}
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
              <div style={{ textAlign: 'right' }}>
                <span className="plabel">Teléfono</span>
                <span className="pval" style={{ fontSize: '11px' }}>{patient.phone || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Exámenes solicitados */}
          <div className="body">
            <p className="body-title">Exámenes Solicitados</p>
            {grouped.length === 0 && otherLines.length === 0 ? (
              <p className="empty">No se especificaron exámenes.</p>
            ) : (
              <div className="cats">
                {grouped.map((g) => (
                  <div key={g.category} className="cat">
                    <div className="cat-name">{g.category}</div>
                    {g.names.map((n, i) => (
                      <div key={i} className="test">{n}</div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {otherLines.length > 0 && (
              <div className="others">
                <p className="others-title">Otros</p>
                <div className="others-body">{otherLines.join('\n')}</div>
              </div>
            )}
          </div>

          {/* Pie: QR de verificación + firma del médico */}
          <div className="footer" style={qrDataUrl ? undefined : { justifyContent: 'flex-end' }}>
            {qrDataUrl && (
              <div className="qr-box">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="Código QR de verificación de la orden" />
                <div>
                  <p className="qr-cap-title">Orden verificable</p>
                  <p className="qr-cap-text">Escanea el código para ver y validar esta orden en su versión digital.</p>
                  <p className="qr-code">{order.verification_code}</p>
                </div>
              </div>
            )}

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
