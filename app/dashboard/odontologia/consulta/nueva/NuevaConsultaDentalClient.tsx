'use client'

import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft, ClipboardList, FileText, History, Save } from 'lucide-react'
import IconoMuela from '@/app/components/IconoMuela'
import ConnectionBanner from '@/app/dashboard/components/ConnectionBanner'
import HistorySummaryModals from '@/app/dashboard/consultations/new/HistorySummaryModals'
import RecetaConsulta from '@/app/dashboard/consultations/new/RecetaConsulta'
import { calculateAge } from '@/utils/age'
import { ANTECEDENTES, antecedenteParaMostrar } from '@/utils/antecedentes'
import { ajustarAutoCrece, autoCrecer } from '@/utils/autoCrecer'
import { agregarParametros } from '@/utils/camposGuardado'
import type { ConsultationRow, PatientRow, PrescriptionRow } from '@/utils/clinicalTypes'
import { formatDateTimeHN } from '@/utils/datetime'
import { draftKey, formDataToFields } from '@/utils/formDraft'
import { writeFormField } from '@/utils/formFields'
import { guardarEnApi } from '@/utils/guardarApi'
import type { guardarConsultaDental } from '@/utils/guardado/consulta-dental'
import { parseMedicinesText } from '@/utils/medicines'
import { validarEstado, type Denticion, type EstadoOdontograma, type TrabajoOdontologico } from '@/utils/odontograma'
import { useFormDraft } from '@/utils/useFormDraft'
import Odontograma from '../../components/Odontograma'
import HistorialTrabajos, { type TrabajosConsulta } from './HistorialTrabajos'
import styles from './consultaDental.module.css'

interface ConsultaAnterior extends ConsultationRow {
  tipo: string
  intraoral_exam: string | null
  procedures_done: string | null
}

interface Props {
  paciente: PatientRow
  appointmentId: string | null
  consultas: ConsultaAnterior[]
  ultimaReceta?: PrescriptionRow
  currentUserId: string
  denticionInicial: Denticion
  estadoInicial: EstadoOdontograma
  pendientes: TrabajoOdontologico[]
  trabajosPrevios: TrabajosConsulta[]
}

const CAMPOS = {
  reason_for_visit: { etiqueta: 'Motivo de consulta', requerido: true },
  intraoral_exam: { etiqueta: 'Examen intraoral / Hallazgos', requerido: false },
  diagnosis: { etiqueta: 'Diagnóstico', requerido: true },
  procedures_done: { etiqueta: 'Procedimientos realizados', requerido: false },
  treatment_plan: { etiqueta: 'Plan e indicaciones', requerido: true },
}

const CAMPOS_HISTORIAL = {
  reason_for_visit: CAMPOS.reason_for_visit.etiqueta,
  symptoms: 'Sintomatología / Anamnesis',
  physical_exam: 'Resultados de estudios',
  intraoral_exam: CAMPOS.intraoral_exam.etiqueta,
  diagnosis: CAMPOS.diagnosis.etiqueta,
  procedures_done: CAMPOS.procedures_done.etiqueta,
  treatment_plan: CAMPOS.treatment_plan.etiqueta,
}

function CampoClinico({ name }: { name: keyof typeof CAMPOS }) {
  const { etiqueta, requerido } = CAMPOS[name]

  return (
    <div className="form-group">
      <label htmlFor={name} className="evo-label">
        {etiqueta} {requerido && <span className="evo-requerido" aria-hidden="true">*</span>}
      </label>
      <textarea id={name} className="form-input auto-crece" name={name} rows={3} required={requerido} onInput={autoCrecer} />
    </div>
  )
}

function TituloSeccion({ children }: { children: ReactNode }) {
  return <h3 className={styles.sectionTitle}>{children}</h3>
}

function leerOdontogramaBorrador(raw?: string) {
  if (!raw) return
  try {
    const resultado = validarEstado(JSON.parse(raw))
    if (resultado.ok) return resultado.estado
  } catch {
    // Un odontograma corrupto no impide recuperar los demás campos.
  }
}

export default function NuevaConsultaDentalClient({
  paciente, appointmentId, consultas, ultimaReceta, currentUserId, denticionInicial, estadoInicial, pendientes, trabajosPrevios,
}: Props) {
  const [denticion, setDenticion] = useState(denticionInicial)
  const [estado, setEstado] = useState(estadoInicial)
  const [medicinesText, setMedicinesText] = useState('')
  const [prescriptionNotes, setPrescriptionNotes] = useState('')
  const [includeDiagnosis, setIncludeDiagnosis] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consultaGuardada, setConsultaGuardada] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const expediente = `/dashboard/patients/${paciente.id}`

  const { pendingDraft, scheduleSave, discardDraft, resolvePendingDraft, clearSavedDraft } = useFormDraft(
    draftKey(currentUserId, `${paciente.id}:dental${appointmentId ? `:${appointmentId}` : ''}`),
    () => ({
      ...(formRef.current ? formDataToFields(new FormData(formRef.current)) : {}),
      medicines_text: medicinesText,
      _denticion: denticion,
      _odontograma: JSON.stringify(estado),
    }),
  )

  function restaurarBorrador(fields: Record<string, string>) {
    for (const name of Object.keys(CAMPOS)) {
      writeFormField(formRef.current, name, fields[name] ?? '')
    }
    setMedicinesText(fields.medicines_text ?? '')
    setPrescriptionNotes(fields.prescription_notes ?? '')
    setIncludeDiagnosis(fields.include_diagnosis === 'on')

    const denticionGuardada = fields._denticion
    if (denticionGuardada === 'PERMANENTE' || denticionGuardada === 'TEMPORAL' || denticionGuardada === 'MIXTA') {
      setDenticion(denticionGuardada)
    }
    const estadoGuardado = leerOdontogramaBorrador(fields._odontograma)
    if (estadoGuardado) setEstado(estadoGuardado)

    resolvePendingDraft()
    requestAnimationFrame(() => ajustarAutoCrece(formRef.current))
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    setError(null)

    const validado = validarEstado(estado)
    if (!validado.ok) {
      setError(validado.error)
      return
    }

    const fd = agregarParametros(new FormData(event.currentTarget), {
      _patientId: paciente.id,
      _appointmentId: appointmentId,
      _medicines: parseMedicinesText(medicinesText),
      _denticion: denticion,
      _odontograma: JSON.stringify(validado.estado),
    })

    setLoading(true)
    try {
      const resultado = await guardarEnApi<Awaited<ReturnType<typeof guardarConsultaDental>>>('/api/guardar/consulta-dental', fd)
      if ('error' in resultado) {
        setError(resultado.error)
        setLoading(false)
        return
      }

      clearSavedDraft()
      if (resultado.warnings?.length) {
        window.alert('La consulta se guardó, pero hubo avisos:\n\n• ' + resultado.warnings.join('\n• '))
      }
      setConsultaGuardada(resultado.consultationId)
    } catch {
      setError('No se pudo confirmar el guardado. Revisa tu conexión y verifica en el expediente si la consulta quedó registrada antes de reintentar.')
      setLoading(false)
    }
  }

  const edad = calculateAge(paciente.birth_date)

  if (consultaGuardada) {
    const impresion = `/consultations/${consultaGuardada}/print`
    return (
      <section className="card">
        <TituloSeccion>Consulta dental guardada</TituloSeccion>
        <div className={styles.actions}>
          <a className="btn btn-primary" href={`${impresion}/plan-trabajo`} target="_blank" rel="noopener noreferrer">
            Imprimir reporte para el paciente
          </a>
          <a className="btn btn-secondary" href={impresion} target="_blank" rel="noopener noreferrer">Imprimir consulta</a>
          <Link className="btn btn-secondary" href={expediente}>Ir al expediente</Link>
        </div>
      </section>
    )
  }

  return (
    <div className={styles.page}>
      <ConnectionBanner />
      <HistorySummaryModals patient={paciente} consultations={consultas} />

      <header>
        <Link className={styles.backLink} href={expediente}><ChevronLeft size={16} /> Volver al expediente</Link>
        <h2 className={styles.title}>Nueva consulta dental</h2>
      </header>

      <div className="card nc-paciente">
        <div className="nc-avatar" aria-hidden="true">{paciente.first_name.charAt(0)}{paciente.last_name.charAt(0)}</div>
        <div className="nc-paciente-datos">
          <div className="nc-nombre">
            {paciente.first_name} {paciente.last_name}
            {paciente.is_pediatric && <span className="nc-pediatrico">Pediátrico</span>}
          </div>
          {paciente.birth_date && <div className="nc-meta">{edad} {edad === 1 ? 'año' : 'años'}</div>}
        </div>
      </div>

      <section className="card">
        <TituloSeccion><ClipboardList size={18} /> Alergias y antecedentes</TituloSeccion>
        <dl className={styles.antecedentes}>
          {ANTECEDENTES.map(({ campo, titulo }) => (
            <div key={campo}>
              <dt>{titulo}</dt>
              <dd>{antecedenteParaMostrar(paciente[`${campo}_status`], paciente[campo])}</dd>
            </div>
          ))}
        </dl>
      </section>

      {pendingDraft && (
        <div className={styles.draftBanner}>
          <div>
            <strong>Encontramos una consulta dental sin guardar</strong>
            <p>Respaldada en este dispositivo el {formatDateTimeHN(new Date(pendingDraft.savedAt).toISOString())}.</p>
          </div>
          <div className={styles.actions}>
            <button type="button" className="btn btn-primary" onClick={() => restaurarBorrador(pendingDraft.fields)}>Restaurar</button>
            <button type="button" className="btn btn-secondary" onClick={discardDraft}>Descartar</button>
          </div>
        </div>
      )}

      <div className={styles.layout}>
        <form ref={formRef} onSubmit={guardar} onInput={scheduleSave} data-respaldo-propio className={styles.form}>
          <section className="card">
            <TituloSeccion><ClipboardList size={18} /> Evaluación dental</TituloSeccion>
            <CampoClinico name="reason_for_visit" />
            <CampoClinico name="intraoral_exam" />
          </section>

          <section className={`card ${styles.odontogramaCard}`}>
            <TituloSeccion><IconoMuela size={18} /> Odontograma</TituloSeccion>
            <Odontograma
              estado={estado}
              denticion={denticion}
              onChange={(valor) => { setEstado(valor); scheduleSave() }}
              onDenticionChange={(valor) => { setDenticion(valor); scheduleSave() }}
            />
          </section>

          <section className="card">
            <TituloSeccion><FileText size={18} /> Diagnóstico y tratamiento</TituloSeccion>
            <CampoClinico name="diagnosis" />
            <CampoClinico name="procedures_done" />
            <CampoClinico name="treatment_plan" />
          </section>

          <RecetaConsulta
            lastPrescription={ultimaReceta}
            medicinesText={medicinesText}
            setMedicinesText={(valor) => { setMedicinesText(valor); scheduleSave() }}
            prescriptionNotes={prescriptionNotes}
            setPrescriptionNotes={(valor) => { setPrescriptionNotes(valor); scheduleSave() }}
            includeDiagnosis={includeDiagnosis}
            setIncludeDiagnosis={(valor) => { setIncludeDiagnosis(valor); scheduleSave() }}
          />

          {error && <p className={styles.error} role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            <Save size={18} /> {loading ? 'Guardando consulta…' : 'Finalizar consulta dental'}
          </button>
        </form>

        <div className={styles.lateral}>
          <HistorialTrabajos denticion={denticionInicial} pendientes={pendientes} consultas={trabajosPrevios} />
          <aside className={`card ${styles.historial}`}>
            <TituloSeccion><History size={18} /> Historial de consultas</TituloSeccion>
            {consultas.length === 0 && <p className={styles.muted}>Sin consultas previas.</p>}
            {consultas.map((consulta) => (
              <details key={consulta.id} className={styles.consulta}>
                <summary>
                  {formatDateTimeHN(consulta.created_at)}
                  {consulta.tipo === 'DENTAL' && <span className="badge badge-info">Odontología</span>}
                  <span className={styles.muted}>{consulta.diagnosis || consulta.reason_for_visit || 'Consulta'}</span>
                </summary>
                <dl>
                  {Object.entries(CAMPOS_HISTORIAL).map(([campo, etiqueta]) => {
                    const valor = consulta[campo as keyof typeof CAMPOS_HISTORIAL]
                    return valor && <div key={campo}><dt>{etiqueta}</dt><dd>{valor}</dd></div>
                  })}
                </dl>
              </details>
            ))}
          </aside>
        </div>
      </div>
    </div>
  )
}
