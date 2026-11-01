import React from 'react'
import PrintControlBar from './PrintControlBar'
import { doctorShortName } from '@/utils/doctorName'
import { formatDateLongHN, formatTimeHN } from '@/utils/datetime'
import { formatYmd, leaveEndDate } from '@/utils/incapacidad'
import type { ClinicRow, ConsultationRow, DoctorProfileRow, PatientRow } from '@/utils/clinicalTypes'

/** «31 de octubre de 2026» (sin el día de la semana de formatDateLongHN). */
function fechaSinDia(value: string): string {
  return formatDateLongHN(value).replace(/^\S+\s/, '')
}

/**
 * «Constancia médica de incapacidad»: hoja propia para las incapacidades con inicio y días
 * (las de solo texto siguen con el formato de resumen de consulta). El período va destacado; el
 * diagnóstico es el de la constancia, no el de la consulta. Si falta la identidad del paciente, se
 * avisa en pantalla y no se imprime «N/A».
 */
export default function ConstanciaIncapacidad({ c, patient, doctor, clinic, qrDataUrl }: {
  c: ConsultationRow & { leave_start_date: string; leave_days: number }
  patient: PatientRow
  doctor: DoctorProfileRow
  clinic: ClinicRow
  qrDataUrl: string
}) {
  const docName = doctorShortName(doctor.first_name, doctor.last_name, doctor.gender)
  const specialty = doctor.specialty || 'Medicina General'
  const logoUrl = doctor.practice_logo_url || clinic.logo_url
  const clinicName = doctor.practice_name || clinic.name
  const contacto = [doctor.practice_address || clinic.address, (doctor.practice_phone || clinic.phone) && `Tel. ${doctor.practice_phone || clinic.phone}`]
    .filter(Boolean).join(' · ')
  const dni = patient.id_card?.trim()
  const atendido = patient.gender === 'F' ? 'atendida' : patient.gender === 'M' ? 'atendido' : 'atendido(a)'
  const fin = leaveEndDate(c.leave_start_date, c.leave_days) ?? c.leave_start_date
  // Emisión: cuando se registró la incapacidad (si es de antes de guardarla aparte, la consulta).
  const emitida = c.leave_issued_at || c.created_at

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        body {
          background: #e2e8f0; margin: 0; padding: 0; color: #111827;
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .page-wrap { display: flex; flex-direction: column; align-items: center; padding: 24px 12px 48px; gap: 12px; }
        .sheet { width: 200mm; min-height: 277mm; background: #fff; padding: 16mm 18mm 14mm; box-shadow: 0 8px 30px rgba(15,23,42,0.12); display: flex; flex-direction: column; }

        .control-bar { background: #0f172a; color: #fff; padding: 14px 28px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 10; }
        .control-title { display: flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 700; margin: 0; }
        .control-buttons { display: flex; gap: 10px; }
        .btn-print { display: inline-flex; align-items: center; gap: 8px; background: #0d9488; color: #fff; border: none; padding: 10px 20px; border-radius: 9px; font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
        .btn-close { display: inline-flex; align-items: center; background: transparent; color: #cbd5e1; border: 1px solid #334155; padding: 10px 18px; border-radius: 9px; font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: inherit; }

        .aviso { width: 200mm; max-width: 100%; background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; border-radius: 10px; padding: 10px 14px; font-size: 13px; }

        .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 10px; border-bottom: 1px solid #d1d5db; }
        .head-izq { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .head-logo { max-height: 56px; max-width: 150px; object-fit: contain; }
        .clinica { margin: 0; font-size: 16px; font-weight: 800; }
        .sub { margin: 2px 0 0; font-size: 10.5px; color: #4b5563; }
        .head-der { text-align: right; font-size: 10.5px; color: #4b5563; line-height: 1.45; }
        .head-der strong { color: #111827; font-size: 11.5px; }

        .titulo { margin: 26px 0 2px; text-align: center; font-size: 19px; font-weight: 700; letter-spacing: 0.01em; }
        .codigo { margin: 0 0 22px; text-align: center; font-size: 10px; color: #6b7280; font-family: ui-monospace, monospace; }

        .texto { font-size: 13px; line-height: 1.65; margin: 0 0 16px; }

        .periodo { margin: 0 0 18px; }
        .periodo-titulo { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #4b5563; padding-bottom: 5px; border-bottom: 1px solid #d1d5db; }
        .periodo-cols { display: grid; grid-template-columns: 1.3fr 1fr 1fr; margin-top: 8px; }
        .periodo-cols > div { display: flex; flex-direction: column; gap: 1px; padding: 0 14px; border-left: 1px solid #d1d5db; }
        .periodo-cols > div:first-child { padding-left: 0; border-left: none; }
        .periodo-cols span { font-size: 10.5px; color: #4b5563; }
        .periodo-cols strong { font-size: 15px; font-weight: 500; font-variant-numeric: tabular-nums; }
        .periodo-cols .dur strong { font-weight: 800; }
        .periodo-nota { margin-top: 5px; font-size: 10.5px; color: #4b5563; }

        .datos { display: grid; grid-template-columns: max-content 1fr; gap: 6px 18px; margin: 0; font-size: 12.5px; }
        .datos dt { color: #4b5563; }
        .datos dd { margin: 0; font-weight: 600; white-space: pre-line; }

        .pie { margin-top: auto; padding-top: 28px; display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; }
        .qr { display: flex; align-items: center; gap: 10px; max-width: 260px; }
        .qr img { width: 78px; height: 78px; }
        .qr p { margin: 0; font-size: 9.5px; color: #4b5563; line-height: 1.35; }
        .qr .qr-t { font-size: 10.5px; font-weight: 700; color: #111827; }
        .firma { width: 240px; text-align: center; }
        .firma img { max-height: 110px; max-width: 240px; object-fit: contain; display: block; margin: 0 auto 4px; }
        .sello { height: 110px; }
        .firma-linea { border-top: 1px solid #111827; padding-top: 4px; }
        .firma-nombre { margin: 0; font-size: 12px; font-weight: 700; }
        .firma-dato { margin: 1px 0 0; font-size: 10px; color: #4b5563; }

        @media print {
          body { background: #fff; }
          @page { size: A4; margin: 0; }
          .no-print { display: none !important; }
          .page-wrap { padding: 0; display: block; }
          .sheet { width: 210mm; min-height: 297mm; box-shadow: none; padding: 18mm 20mm 16mm; }
        }
      `}} />

      <PrintControlBar />

      <div className="page-wrap">
        {!dni && (
          <div className="aviso no-print" role="alert">
            Falta el número de identidad del paciente. Agrégalo en el expediente («Editar paciente») antes de imprimir esta constancia.
          </div>
        )}

        <div className="sheet">
          <div className="head">
            <div className="head-izq">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logoUrl && <img className="head-logo" src={logoUrl} alt="Logo" />}
              <div>
                <p className="clinica">{clinicName}</p>
                {contacto && <p className="sub">{contacto}</p>}
              </div>
            </div>
            <div className="head-der">
              <strong>{docName}</strong><br />
              {specialty}
            </div>
          </div>

          <h1 className="titulo">Constancia médica de incapacidad</h1>
          <p className="codigo">{c.verification_code}</p>

          <p className="texto">
            Hago constar que <strong>{patient.first_name} {patient.last_name}</strong>
            {dni && <>, identidad <strong>{dni}</strong></>}, fue {atendido} en consulta el {fechaSinDia(c.created_at)} a las {formatTimeHN(c.created_at).replace(/\.$/, '')}.
          </p>

          <div className="periodo">
            <div className="periodo-titulo">Período de incapacidad</div>
            <div className="periodo-cols">
              <div className="dur"><span>Duración</span><strong>{c.leave_days} {c.leave_days === 1 ? 'día calendario' : 'días calendario'}</strong></div>
              <div><span>Fecha de inicio</span><strong>{formatYmd(c.leave_start_date)}</strong></div>
              <div><span>Último día</span><strong>{formatYmd(fin)}</strong></div>
            </div>
            <div className="periodo-nota">Ambas fechas inclusive.</div>
          </div>

          <dl className="datos">
            {c.leave_diagnosis && <><dt>Diagnóstico</dt><dd>{c.leave_diagnosis}</dd></>}
            {c.medical_leave && <><dt>Indicaciones</dt><dd>{c.medical_leave}</dd></>}
            <dt>Fecha de emisión</dt><dd>{fechaSinDia(emitida)}</dd>
          </dl>

          <div className="pie">
            <div className="qr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="Código QR de verificación del documento" />
              <div>
                <p className="qr-t">Documento verificable</p>
                <p>Escanea el código para validar este documento.</p>
              </div>
            </div>
            <div className="firma">
              {doctor.signature_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={doctor.signature_url} alt="Firma" />
                : <div className="sello" />}
              <div className="firma-linea">
                <p className="firma-nombre">{docName}</p>
                <p className="firma-dato">{specialty}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
