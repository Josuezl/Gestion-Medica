import { notFound } from 'next/navigation'
import type { ClinicRow, DoctorProfileRow, PatientRow } from '@/utils/clinicalTypes'
import { formatDateTimeHN } from '@/utils/datetime'
import { doctorShortName } from '@/utils/doctorName'
import { trabajosPendientes } from '@/utils/odontograma'
import { getSessionProfile } from '@/utils/session'
import { createClient } from '@/utils/supabase/server'
import PrintControlBar from '../PrintControlBar'
import PrintHeader from '../PrintHeader'
import PrintOdontograma from '../PrintOdontograma'
import PrintSignature from '../PrintSignature'
import PrintStyles from '../PrintStyles'
import { cargarOdontograma } from '../cargarOdontograma'

type ConsultaPlan = {
  created_at: string
  diagnosis: string | null
  treatment_plan: string | null
  paciente: Pick<PatientRow, 'first_name' | 'last_name'> | null
  doctor: DoctorProfileRow | null
  clinica: ClinicRow | null
}

export default async function PlanTrabajoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const clinicId = (await getSessionProfile())?.profile?.clinic_id
  if (!clinicId) notFound()

  const supabase = await createClient()
  const { data: consulta } = await supabase.from('consultations').select(`
    created_at, diagnosis, treatment_plan,
    paciente:patients(first_name, last_name),
    doctor:user_profiles!consultations_doctor_id_fkey(
      first_name, last_name, gender, specialty, signature_url,
      practice_name, practice_phone, practice_address, practice_logo_url
    ),
    clinica:clinics(name, phone, address, logo_url)
  `).eq('id', id).eq('clinic_id', clinicId).eq('tipo', 'DENTAL').maybeSingle()
    .overrideTypes<ConsultaPlan | null, { merge: false }>()

  if (!consulta?.paciente || !consulta.doctor || !consulta.clinica) notFound()

  const { paciente, doctor, clinica } = consulta
  const docName = doctorShortName(doctor.first_name, doctor.last_name, doctor.gender)
  const docSpecialty = doctor.specialty || 'Odontología'
  const odontograma = await cargarOdontograma(supabase, id, clinicId)
  const pendientes = odontograma ? trabajosPendientes(odontograma.estado) : []

  return (
    <>
      <PrintStyles />
      <style>{`
        .sheet-plan { width: min(100%, 200mm); padding: 8mm 16mm; }
        .sheet-plan .odontograma-impreso section { zoom: 0.72; }
        .sheet-plan .sign-area { justify-content: flex-end; margin-top: 14px; }
        .plan-tabla { width: 100%; border-collapse: collapse; font-size: 12px; color: #334155; }
        .plan-tabla th, .plan-tabla td { text-align: left; padding: 5px 8px; vertical-align: top; border-bottom: 1px solid #e2e8f0; }
        .plan-tabla th { background: #f8fafc; color: #0f172a; }
        .plan-tabla td { white-space: pre-wrap; overflow-wrap: anywhere; }
        .plan-tabla th:nth-child(1) { width: 29%; }
        .plan-tabla th:nth-child(2) { width: 27%; }
        .plan-pendientes { margin-bottom: 14px; }
        @media screen and (max-width: 640px) {
          .sheet-plan { padding: 16px; }
        }
        @page planTrabajo { size: A4; margin: 8mm 16mm; }
        @media print {
          .sheet.sheet-plan { page: planTrabajo; display: block; width: min(100%, 178mm); min-height: 0; padding: 0; }
          .sheet-plan .divider { margin: 6px 0 8px; }
          .sheet-plan .patient { padding-block: 6px; }
          .sheet-plan .body { margin-top: 10px; }
          .sheet-plan .section, .plan-pendientes { margin-bottom: 8px; }
          .sheet-plan .odontograma-impreso section { zoom: 0.68; }
          .sheet-plan .sign-area { margin-top: 8px; }
          .sheet-plan .sign-empty { height: 32px; }
          .plan-tabla th, .plan-tabla td { padding-block: 3px; }
          .plan-tabla tr { break-inside: avoid; }
        }
      `}</style>
      <PrintControlBar titulo="Plan de trabajo" />

      <main className="page-wrap">
        <article className="sheet sheet-plan">
          <PrintHeader clinic={clinica} doctor={doctor} docName={docName} docSpecialty={docSpecialty} />
          <h1 className="doc-title">Plan de trabajo</h1>
          <div className="divider" />

          <div className="patient">
            <div className="prow">
              <div>
                <span className="plabel">Paciente</span>
                <span className="pval">{paciente.first_name} {paciente.last_name}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="plabel">Fecha de la consulta</span>
                <span className="pval">{formatDateTimeHN(consulta.created_at)}</span>
              </div>
            </div>
          </div>

          <div className="body">
            <PrintOdontograma odontograma={odontograma} />
            <div className="plan-pendientes">
              <h2 className="section-title">Trabajos pendientes</h2>
              <table className="plan-tabla">
                <thead>
                  <tr>
                    <th scope="col">Ubicación</th>
                    <th scope="col">Trabajo</th>
                    <th scope="col">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientes.map(({ ubicacion, etiqueta, nota }) => (
                    <tr key={ubicacion}>
                      <td>{ubicacion}</td>
                      <td>{etiqueta}</td>
                      <td>{nota?.trim() || '—'}</td>
                    </tr>
                  ))}
                  {pendientes.length === 0 && (
                    <tr><td colSpan={3}>{odontograma ? 'No hay trabajos pendientes.' : 'No hay un odontograma guardado para esta consulta.'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="section">
              <h2 className="section-title">Diagnóstico</h2>
              <p className="section-body">{consulta.diagnosis?.trim() || '—'}</p>
            </div>
            <div className="section">
              <h2 className="section-title">Indicaciones</h2>
              <p className="section-body">{consulta.treatment_plan?.trim() || '—'}</p>
            </div>
          </div>

          <div className="sign-area">
            <PrintSignature signatureUrl={doctor.signature_url} docName={docName} docSpecialty={docSpecialty} />
          </div>
        </article>
      </main>
    </>
  )
}
