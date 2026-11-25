import { notFound } from 'next/navigation'
import Odontograma from '@/app/dashboard/odontologia/components/Odontograma'
import type { ClinicRow, DoctorProfileRow, PatientRow } from '@/utils/clinicalTypes'
import { calculateAge } from '@/utils/age'
import { formatDateTimeHN } from '@/utils/datetime'
import { doctorShortName } from '@/utils/doctorName'
import { COLOR_ESTADO, etiquetaRegion, realizadosNuevos, trabajosPendientes, type Denticion, type TrabajoOdontologico } from '@/utils/odontograma'
import { getSessionProfile } from '@/utils/session'
import { createClient } from '@/utils/supabase/server'
import PrintControlBar from '../PrintControlBar'
import PrintHeader from '../PrintHeader'
import PrintSignature from '../PrintSignature'
import PrintStyles from '../PrintStyles'
import { IconoHallazgo } from '@/app/dashboard/odontologia/components/iconos'
import PrintVerification, { generarQrVerificacion } from '../PrintVerification'
import { cargarEstadoAnterior, cargarOdontograma } from '../cargarOdontograma'
import styles from './reporte.module.css'

type ConsultaReporte = {
  patient_id: string
  created_at: string
  reason_for_visit: string | null
  intraoral_exam: string | null
  diagnosis: string | null
  procedures_done: string | null
  treatment_plan: string | null
  verification_code: string | null
  paciente: Pick<PatientRow, 'first_name' | 'last_name' | 'birth_date' | 'dob_status' | 'gender' | 'id_card'> | null
  doctor: DoctorProfileRow | null
  clinica: ClinicRow | null
}

function TablaTrabajos({ realizados, trabajos, denticion }: {
  realizados?: boolean
  trabajos: TrabajoOdontologico[]
  denticion: Denticion
}) {
  const titulo = realizados ? 'Realizado en esta consulta' : 'Plan de trabajo'
  const estado = realizados ? 'realizado' : 'pendiente'
  return (
    <section aria-label={titulo}>
      <div className={styles.encabezado}>
        <h2>{titulo}</h2>
        <span>{trabajos.length} {trabajos.length === 1 ? `trabajo ${estado}` : `trabajos ${estado}s`}</span>
      </div>
      {trabajos.length ? (
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th scope="col">Pieza</th>
              <th scope="col">Superficie</th>
              <th scope="col">Trabajo {estado}</th>
              <th scope="col">Nota</th>
            </tr>
          </thead>
          <tbody>
            {trabajos.map((trabajo) => {
              const pieza = 'region' in trabajo ? etiquetaRegion(trabajo.region, denticion) : trabajo.fdi
              const superficie = 'fdi' in trabajo ? trabajo.superficie : undefined
              return (
                <tr key={`${pieza}:${superficie ?? ''}`}>
                  <td>{pieza}</td>
                  <td>{superficie || '—'}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <IconoHallazgo hallazgo={trabajo.hallazgo} estado={realizados ? 'REALIZADO' : 'PENDIENTE'} size={16} />
                      {trabajo.etiqueta}
                    </span>
                  </td>
                  <td>{trabajo.nota?.trim() || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : <p className="section-body">{realizados ? 'Ninguno.' : 'Sin trabajos pendientes.'}</p>}
    </section>
  )
}

export default async function ReporteOdontologicoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const clinicId = (await getSessionProfile())?.profile?.clinic_id
  if (!clinicId) notFound()

  const supabase = await createClient()
  const { data: consulta } = await supabase.from('consultations').select(`
    patient_id, created_at, reason_for_visit, intraoral_exam, diagnosis, procedures_done, treatment_plan, verification_code,
    paciente:patients(first_name, last_name, birth_date, dob_status, gender, id_card),
    doctor:user_profiles!consultations_doctor_id_fkey(first_name, last_name, gender, specialty, signature_url),
    clinica:clinics(name, phone, address, logo_url)
  `).eq('id', id).eq('clinic_id', clinicId).eq('tipo', 'DENTAL').maybeSingle()
    .overrideTypes<ConsultaReporte | null, { merge: false }>()

  if (!consulta?.paciente || !consulta.doctor || !consulta.clinica) notFound()

  const { paciente, doctor, clinica } = consulta
  const docName = doctorShortName(doctor.first_name, doctor.last_name, doctor.gender)
  const docSpecialty = doctor.specialty || 'Odontología'
  const [odontograma, qrDataUrl] = await Promise.all([
    cargarOdontograma(supabase, id, clinicId),
    consulta.verification_code ? generarQrVerificacion(consulta.verification_code, 'dental') : null,
  ])
  const anterior = odontograma ? await cargarEstadoAnterior(supabase, clinicId, consulta.patient_id, odontograma) : null
  const realizados = odontograma ? realizadosNuevos(odontograma.estado, anterior) : []
  const pendientes = odontograma ? trabajosPendientes(odontograma.estado) : []
  const denticion = odontograma?.denticion ?? 'PERMANENTE'
  const edad = paciente.birth_date && paciente.dob_status !== 'unknown' ? `${calculateAge(paciente.birth_date)} años` : '—'
  const sexo = paciente.gender === 'F' ? 'Femenino' : paciente.gender === 'M' ? 'Masculino' : paciente.gender === 'O' ? 'Otro' : '—'
  const resumen = [
    ['Motivo de consulta', consulta.reason_for_visit],
    ['Examen intraoral', consulta.intraoral_exam],
    ['Diagnóstico', consulta.diagnosis],
    ['Procedimientos realizados', consulta.procedures_done],
  ]

  return (
    <>
      <PrintStyles />
      <PrintControlBar titulo="Reporte odontológico" />

      <main className="page-wrap">
        <article className={`sheet ${styles.reporte}`}>
          <PrintHeader clinic={clinica} doctor={doctor} docName={docName} docSpecialty={docSpecialty} reporteDental />
          <div className={styles.titulo}>
            <p className="doc-title">REPORTE ODONTOLÓGICO</p>
            <h1>Consulta y plan de tratamiento</h1>
          </div>

          <div className={styles.paciente}>
            <div>
              <span className="plabel">Paciente</span>
              <p>{paciente.first_name} {paciente.last_name}</p>
              <span className={styles.datos}>Edad: {edad} | Sexo: {sexo} | DNI: {paciente.id_card || '—'}</span>
            </div>
            <div className={styles.fecha}>
              <span className="plabel">Fecha de la consulta</span>
              <span className="pval">{formatDateTimeHN(consulta.created_at)}</span>
            </div>
          </div>

          <section>
            <div className={styles.encabezado}><h2>Resumen de la consulta</h2></div>
            <dl className={styles.resumen}>
              {resumen.map(([etiqueta, valor]) => (
                <div key={etiqueta}>
                  <dt>{etiqueta}</dt>
                  <dd className="section-body">{valor?.trim() || '—'}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className={styles.odontograma}>
            <div className={styles.encabezado}>
              <h2>Odontograma</h2>
              <div className={styles.leyenda}>
                <span><i style={{ background: COLOR_ESTADO.PENDIENTE }} /> Pendiente</span>
                <span><i style={{ background: COLOR_ESTADO.REALIZADO }} /> Realizado</span>
              </div>
            </div>
            {odontograma
              ? <Odontograma estado={odontograma.estado} denticion={denticion} soloLectura ampliar={false} mostrarLeyenda={false} />
              : <p className="section-body">—</p>}
          </section>

          <TablaTrabajos realizados trabajos={realizados} denticion={denticion} />
          <TablaTrabajos trabajos={pendientes} denticion={denticion} />

          <section>
            <div className={styles.encabezado}><h2>Indicaciones y recomendaciones</h2></div>
            <p className="section-body">{consulta.treatment_plan?.trim() || '—'}</p>
          </section>

          <div className="sign-area">
            {qrDataUrl && <PrintVerification codigo={consulta.verification_code} qrDataUrl={qrDataUrl} />}
            <PrintSignature signatureUrl={doctor.signature_url} docName={docName} docSpecialty={docSpecialty} />
          </div>
        </article>
      </main>
    </>
  )
}
