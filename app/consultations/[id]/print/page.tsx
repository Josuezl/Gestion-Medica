import React from 'react'
import QRCode from 'qrcode'
import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import PrintControlBar from './PrintControlBar'
import ConstanciaIncapacidad from './ConstanciaIncapacidad'
import { loadPublicDocument } from '@/utils/publicDocument'
import DocumentCodeGate from '@/app/components/DocumentCodeGate'
import { doctorShortName } from '@/utils/doctorName'
import { formatDateTimeHN } from '@/utils/datetime'
import { calculateAge } from '@/utils/age'
import { etiquetaTipoConsulta, type ConsultaConTipo } from '@/utils/tipoConsulta'
import { bpReadings } from '@/utils/bloodPressure'
import PrintHeader from './PrintHeader'
import PrintOdontograma from './PrintOdontograma'
import PrintSignature from './PrintSignature'
import PrintStyles from './PrintStyles'
import { cargarOdontograma } from './cargarOdontograma'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function PrintConsultationSummaryPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params
  const consultationId = resolvedParams.id
  const resolvedSearchParams = searchParams ? await searchParams : {}
  // Modo "referencia": muestra solo Motivo de Consulta + Motivo de Referencia (en vez del resumen completo).
  const isReferral = resolvedSearchParams?.doc === 'referral'
  const wantsDental = resolvedSearchParams?.doc === 'dental'
  const code = typeof resolvedSearchParams?.code === 'string'
    ? resolvedSearchParams.code
    : Array.isArray(resolvedSearchParams?.code) ? resolvedSearchParams.code[0] : undefined

  // Acceso: personal de la clínica (sesión) o el paciente con el código del documento.
  const access = await loadPublicDocument<ConsultaConTipo>('consultations', consultationId, code)
  if (access.status === 'notfound') return notFound()
  if (access.status === 'gate') {
    return (
      <DocumentCodeGate
        basePath={`/consultations/${consultationId}/print`}
        extraQuery={isReferral ? '&doc=referral' : wantsDental ? '&doc=dental' : ''}
        hasError={!!access.hasError}
        docLabel={isReferral ? 'Referencia Médica' : wantsDental ? 'Consulta de Odontología' : 'Incapacidad Médica'}
      />
    )
  }
  const { doc: consultation, patient, doctor, clinic } = access
  if (!consultation || !patient || !doctor || !clinic) return notFound()

  const c = consultation
  const hasLeavePeriod = !!(c.leave_start_date && c.leave_days)
  const dental = !isReferral && (wantsDental || (!hasLeavePeriod && !c.medical_leave?.trim()))
    ? etiquetaTipoConsulta(c.tipo)
    : null

  const patientAge = calculateAge(patient.birth_date)
  const formattedDate = formatDateTimeHN(consultation.created_at)
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const verifyUrl = `${SITE_URL}/verificar/${consultation.verification_code}${isReferral ? '?doc=referral' : dental ? '?doc=dental' : ''}`
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
  const docName = doctorShortName(doctor.first_name, doctor.last_name, doctor.gender)
  const docSpecialty = doctor.specialty || 'Medicina General'
  const getGenderText = (g?: string | null) => (g === 'M' ? 'Masculino' : g === 'F' ? 'Femenino' : 'Otro')

  // Incapacidad con inicio y días: hoja propia («Constancia médica de incapacidad»).
  if (!dental && !isReferral && c.leave_start_date && c.leave_days) {
    return (
      <ConstanciaIncapacidad
        c={{ ...c, leave_start_date: c.leave_start_date, leave_days: c.leave_days }}
        patient={patient} doctor={doctor} clinic={clinic} qrDataUrl={qrDataUrl}
      />
    )
  }
  const hc = c.head_circumference
  const hasVitals = c.weight || c.height || bpReadings(c).length > 0 || c.temperature || c.heart_rate || c.respiratory_rate || c.oxygen_saturation || hc

  const sections = (dental
    ? [
        { title: 'Motivo de Consulta', value: c.reason_for_visit },
        { title: 'Examen intraoral', value: c.intraoral_exam?.trim() || '—' },
        { title: 'Diagnóstico', value: c.diagnosis },
        { title: 'Procedimientos realizados', value: c.procedures_done?.trim() || '—' },
        { title: 'Plan de Tratamiento / Recomendaciones', value: c.treatment_plan },
      ]
    : isReferral
    ? [
        { title: 'Dirigido a', value: c.referral_to },
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
  const showVitals = hasVitals && !isReferral && !dental
  // loadPublicDocument ya autorizó el acceso por sesión o código para esta consulta.
  const odontograma = dental && c.clinic_id
    ? await cargarOdontograma(
        createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!),
        consultationId,
        c.clinic_id,
      )
    : null

  return (
    <>
      <PrintStyles />

      {dental && <style>{`
        .sheet-dental .body {
          display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
          align-content: start; gap: 8px 16px;
        }
        .sheet-dental .section { margin-bottom: 0; }
        .odontograma-impreso { grid-column: 1 / -1; scroll-margin-top: 5rem; }
        .odontograma-impreso section { zoom: 0.72; }
        @media print {
          .sheet.sheet-dental { min-height: 296mm; padding: 8mm 16mm; }
          .sheet-dental .sign-area { margin-top: 14px; }
          .odontograma-impreso section { zoom: 0.68; }
        }
      `}</style>}
      <PrintControlBar titulo={dental ? `Consulta de ${dental}` : undefined} />

      <div className="page-wrap">
        <div className={dental ? 'sheet sheet-dental' : 'sheet'}>
          <PrintHeader clinic={clinic} doctor={doctor} docName={docName} docSpecialty={docSpecialty} />

          <p className="doc-title">{dental ? `Consulta de ${dental}` : isReferral ? 'Referencia Médica' : 'Incapacidad Médica'}</p>
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
                {bpReadings(c).map((r) => (
                  <span key={r.arm ?? 'pa'} className="vital">
                    P. Arterial{r.arm === 'left' ? ' (brazo izq.)' : r.arm === 'right' ? ' (brazo der.)' : ''}: <strong>{r.value}</strong>
                  </span>
                ))}
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

            {dental && (
              <PrintOdontograma odontograma={odontograma} />
            )}
            {!dental && !isReferral && c.medical_leave && String(c.medical_leave).trim() !== '' && (
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
            <PrintSignature signatureUrl={doctor.signature_url} docName={docName} docSpecialty={docSpecialty} />
          </div>
        </div>
      </div>
    </>
  )
}
