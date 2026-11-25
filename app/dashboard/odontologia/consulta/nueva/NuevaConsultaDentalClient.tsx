'use client'

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { CalendarDays, CheckCircle2, ChevronLeft, ClipboardList, FileText, History, Printer, Save, X } from 'lucide-react'
import IconoMuela from '@/app/components/IconoMuela'
import ConnectionBanner from '@/app/dashboard/components/ConnectionBanner'
import HistorySummaryModals from '@/app/dashboard/consultations/new/HistorySummaryModals'
import RecetaConsulta from '@/app/dashboard/consultations/new/RecetaConsulta'
import SolicitudCard from '@/app/dashboard/consultations/new/SolicitudCard'
import {
  StudyRequestList, StudyRequestModal, type CatalogSection, type RequestStudy, type StudyRequestValue,
} from '@/app/dashboard/consultations/new/StudyRequestModal'
import { CamposIncapacidad, PanelIncluir, type LeaveValue } from '@/app/dashboard/components/CamposIncapacidad'
import { calculateAge } from '@/utils/age'
import { ANTECEDENTES, antecedenteParaMostrar } from '@/utils/antecedentes'
import { ajustarAutoCrece, autoCrecer } from '@/utils/autoCrecer'
import { agregarParametros } from '@/utils/camposGuardado'
import type { ConsultationRow, PatientRow, PrescriptionRow } from '@/utils/clinicalTypes'
import { formatDateTimeHN, ymdHN } from '@/utils/datetime'
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
  studyCatalog: CatalogSection[]
  lastStudyRequest: { studies: RequestStudy[]; other_studies: string | null; created_at: string } | null
}

const LEAVE_VACIA: LeaveValue = { start: '', days: '', diagnosis: '', reason: '' }
const ESTUDIOS_VACIOS: StudyRequestValue = { studies: [], otherStudies: '', manualToCatalog: [] }

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

function CampoClinico({ name, onInput }: { name: keyof typeof CAMPOS; onInput?: (valor: string) => void }) {
  const { etiqueta, requerido } = CAMPOS[name]

  return (
    <div className="form-group">
      <label htmlFor={name} className="evo-label">
        {etiqueta} {requerido && <span className="evo-requerido" aria-hidden="true">*</span>}
      </label>
      <textarea id={name} className="form-input auto-crece" name={name} rows={3} required={requerido}
        onInput={(evento) => { autoCrecer(evento); onInput?.(evento.currentTarget.value) }} />
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
  studyCatalog, lastStudyRequest,
}: Props) {
  const [denticion, setDenticion] = useState(denticionInicial)
  const [estado, setEstado] = useState(estadoInicial)
  const [medicinesText, setMedicinesText] = useState('')
  const [prescriptionNotes, setPrescriptionNotes] = useState('')
  const [includeDiagnosis, setIncludeDiagnosis] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [studyRequest, setStudyRequest] = useState<StudyRequestValue>(ESTUDIOS_VACIOS)
  const [showStudyModal, setShowStudyModal] = useState(false)
  const [includeLeave, setIncludeLeave] = useState(false)
  const [leave, setLeave] = useState<LeaveValue>(LEAVE_VACIA)
  const [diagnosisText, setDiagnosisText] = useState('')
  const [verHistorial, setVerHistorial] = useState(false)
  const historialRef = useRef<HTMLDialogElement>(null)
  const [consultaGuardada, setConsultaGuardada] = useState<{
    id: string; studyRequestId: string | null; hasMedicalLeave: boolean; prescriptionId: string | null
  } | null>(null)
  const studyRequestCount = studyRequest.studies.length + (studyRequest.otherStudies.trim() ? 1 : 0)
  const formRef = useRef<HTMLFormElement>(null)
  const expediente = `/dashboard/patients/${paciente.id}`

  const { pendingDraft, scheduleSave, discardDraft, resolvePendingDraft, clearSavedDraft } = useFormDraft(
    draftKey(currentUserId, `${paciente.id}:dental${appointmentId ? `:${appointmentId}` : ''}`),
    () => ({
      ...(formRef.current ? formDataToFields(new FormData(formRef.current)) : {}),
      medicines_text: medicinesText,
      _denticion: denticion,
      _odontograma: JSON.stringify(estado),
      study_request: JSON.stringify(studyRequest),
      include_medical_leave: includeLeave ? 'on' : '',
    }),
  )

  useEffect(() => {
    const dialogo = historialRef.current
    if (verHistorial && dialogo && !dialogo.open) dialogo.showModal()
  }, [verHistorial])

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
    setDiagnosisText(fields.diagnosis ?? '')
    setIncludeLeave(fields.include_medical_leave === 'on' || !!fields.medical_leave?.trim())
    setLeave({ start: fields.leave_start_date ?? '', days: fields.leave_days ?? '', diagnosis: fields.leave_diagnosis ?? '', reason: fields.medical_leave ?? '' })
    if (fields.study_request) {
      try {
        const parsed = JSON.parse(fields.study_request) as Partial<StudyRequestValue>
        setStudyRequest({
          studies: Array.isArray(parsed.studies) ? parsed.studies : [],
          otherStudies: parsed.otherStudies ?? '',
          manualToCatalog: Array.isArray(parsed.manualToCatalog) ? parsed.manualToCatalog : [],
        })
      } catch {
        // Un borrador de estudios dañado no impide recuperar lo demás.
      }
    }

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
      setConsultaGuardada({
        id: resultado.consultationId,
        studyRequestId: resultado.studyRequestId ?? null,
        hasMedicalLeave: !!resultado.hasMedicalLeave,
        prescriptionId: resultado.prescriptionId ?? null,
      })
    } catch {
      setError('No se pudo confirmar el guardado. Revisa tu conexión y verifica en el expediente si la consulta quedó registrada antes de reintentar.')
      setLoading(false)
    }
  }

  const edad = calculateAge(paciente.birth_date)

  return (
    <div className={styles.page}>
      <ConnectionBanner />
      {consultaGuardada && <ConsultaGuardadaModal consulta={consultaGuardada} expediente={expediente} />}
      <HistorySummaryModals patient={paciente} consultations={consultas} />

      <header className={styles.encabezado}>
        <div>
          <Link className={styles.backLink} href={expediente}><ChevronLeft size={16} /> Volver al expediente</Link>
          <h2 className={styles.title}>Nueva consulta dental</h2>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setVerHistorial(true)}>
          <History size={18} /> Historial de consultas ({consultas.length})
        </button>
      </header>

      {showStudyModal && (
        <StudyRequestModal
          catalog={studyCatalog}
          initial={studyRequest}
          onSave={(valor) => { setStudyRequest(valor); setShowStudyModal(false); scheduleSave() }}
          onClose={() => setShowStudyModal(false)}
        />
      )}

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
            <div className={styles.camposDobles}>
              <CampoClinico name="reason_for_visit" />
              <CampoClinico name="intraoral_exam" />
            </div>
          </section>

          <section className={`card ${styles.odontogramaCard}`}>
            <TituloSeccion><IconoMuela size={18} /> Odontograma</TituloSeccion>
            <Odontograma
              estado={estado}
              denticion={denticion}
              onChange={(valor) => { setEstado(valor); scheduleSave() }}
              onDenticionChange={(valor) => { setDenticion(valor); scheduleSave() }}
            />
            {/* En la misma sección del odontograma: lo pendiente y lo realizado en visitas anteriores. */}
            <HistorialTrabajos denticion={denticionInicial} pendientes={pendientes} consultas={trabajosPrevios} />
          </section>

          <section className="card">
            <TituloSeccion><FileText size={18} /> Diagnóstico y tratamiento</TituloSeccion>
            <div className={styles.camposDobles}>
              <CampoClinico name="diagnosis" onInput={setDiagnosisText} />
              <CampoClinico name="procedures_done" />
              <CampoClinico name="treatment_plan" />
            </div>
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

          <section className="card">
            <TituloSeccion><FileText size={18} /> Estudios e incapacidad</TituloSeccion>
            <input type="hidden" name="study_request" value={JSON.stringify(studyRequest)} />
            <div className="sol-grid">
              <SolicitudCard
                icono={<ClipboardList size={22} />}
                titulo="Estudios"
                descripcion="Radiografías dentales y otros estudios."
                vacio="Sin estudios seleccionados."
                botonTexto="Seleccionar estudios"
                cantidad={studyRequestCount}
                unidades={['estudio seleccionado', 'estudios seleccionados']}
                onAbrir={() => setShowStudyModal(true)}
                onQuitar={() => { setStudyRequest(ESTUDIOS_VACIOS); scheduleSave() }}
                lista={<StudyRequestList studies={studyRequest.studies} otherStudies={studyRequest.otherStudies} />}
                ultima={lastStudyRequest && Array.isArray(lastStudyRequest.studies) && (lastStudyRequest.studies.length > 0 || (lastStudyRequest.other_studies || '').trim()) ? {
                  fecha: lastStudyRequest.created_at,
                  etiqueta: 'Última solicitud',
                  lista: <StudyRequestList studies={lastStudyRequest.studies} otherStudies={lastStudyRequest.other_studies} />,
                  onImportar: () => { setStudyRequest({ studies: lastStudyRequest.studies || [], otherStudies: lastStudyRequest.other_studies || '', manualToCatalog: [] }); scheduleSave() },
                } : null}
              />
              <PanelIncluir
                icono={<CalendarDays size={22} />}
                titulo="Incapacidad"
                incluido={includeLeave}
                onIncluir={(valor) => {
                  setIncludeLeave(valor)
                  // Al encender, la fecha de inicio arranca en hoy (editable), igual que en la consulta médica.
                  if (valor && !leave.start) setLeave({ ...leave, start: ymdHN(new Date()) })
                  scheduleSave()
                }}
              >
                <CamposIncapacidad value={leave} onChange={(valor) => { setLeave(valor); scheduleSave() }} diagnosticoConsulta={diagnosisText} />
              </PanelIncluir>
            </div>
          </section>

          {error && <p className={styles.error} role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            <Save size={18} /> {loading ? 'Guardando consulta…' : 'Finalizar consulta dental'}
          </button>
        </form>

      </div>

      {verHistorial && (
        <dialog ref={historialRef} className={styles.historialDialogo} aria-labelledby="historial-consultas-titulo"
          onClose={() => setVerHistorial(false)}>
          <div className={styles.historialCabecera}>
            <h3 id="historial-consultas-titulo" className={styles.sectionTitle}><History size={18} /> Historial de consultas</h3>
            <button type="button" className="btn btn-secondary" aria-label="Cerrar historial" onClick={() => historialRef.current?.close()}>
              <X size={18} />
            </button>
          </div>
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
        </dialog>
      )}
    </div>
  )
}

/** Confirmación tras guardar (mismo estilo que la consulta médica): documentos para imprimir. */
function ConsultaGuardadaModal({ consulta, expediente }: {
  consulta: { id: string; studyRequestId: string | null; hasMedicalLeave: boolean; prescriptionId: string | null }
  expediente: string
}) {
  const impresion = `/consultations/${consulta.id}/print`
  const documentos = [
    { texto: 'Imprimir reporte para el paciente', href: `${impresion}/plan-trabajo` },
    { texto: 'Imprimir consulta', href: `${impresion}?doc=dental` },
    consulta.prescriptionId && { texto: 'Imprimir receta', href: `/prescriptions/${consulta.prescriptionId}/print` },
    consulta.studyRequestId && { texto: 'Imprimir solicitud de estudios', href: `/study-requests/${consulta.studyRequestId}/print` },
    consulta.hasMedicalLeave && { texto: 'Imprimir incapacidad', href: impresion },
  ].filter((d): d is { texto: string; href: string } => Boolean(d))

  return (
    <div className={styles.modalFondo}>
      <div className={styles.modalTarjeta} role="dialog" aria-modal="true" aria-labelledby="consulta-guardada-titulo">
        <CheckCircle2 size={48} className={styles.modalIcono} aria-hidden="true" />
        <h3 id="consulta-guardada-titulo" className={styles.modalTitulo}>Consulta guardada exitosamente</h3>
        <p className={styles.modalTexto}>Imprime los documentos que necesites:</p>
        <div className={styles.modalAcciones}>
          {documentos.map(({ texto, href }, indice) => (
            <a key={href} className={`btn ${indice === 0 ? 'btn-primary' : 'btn-secondary'}`} href={href}
              target="_blank" rel="noopener noreferrer">
              <Printer size={16} aria-hidden="true" /> {texto}
            </a>
          ))}
          <Link className="btn btn-secondary" href={expediente}>Ir al expediente</Link>
        </div>
      </div>
    </div>
  )
}
