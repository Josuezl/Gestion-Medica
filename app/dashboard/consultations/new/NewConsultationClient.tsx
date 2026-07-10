'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createConsultation } from '../actions'
import { updatePatientGender } from '../../patients/actions'
import {
  Heart,
  Activity,
  Stethoscope,
  Clipboard,
  Pill,
  ChevronLeft,
  Save,
  Loader2,
  Printer,
  FlaskConical,
  ClipboardList
} from 'lucide-react'
import PatientHistoryTabs from '../../components/PatientHistoryTabs'
import { calculateAge } from '@/utils/age'
import { parseMedicinesText, medicinesToText } from '@/utils/medicines'
import { formatDateHN, formatDateTimeHN } from '@/utils/datetime'
import { LastValueRef } from './LastValueRef'
import HistorySummaryModals from './HistorySummaryModals'
import { LabOrderList, LabOrderModal } from './LabOrderModal'
import { StudyRequestList, StudyRequestModal, type CatalogSection, type StudyRequestValue, type RequestStudy } from './StudyRequestModal'
import type { PatientRow, ConsultationRow, PrescriptionRow, StudyRow, LabOrderRow, PreclinicalVitalsRow } from '@/utils/clinicalTypes'
import { draftKey, formDataToFields } from '@/utils/formDraft'
import { useFormDraft } from '@/utils/useFormDraft'
import ConnectionBanner from '../../components/ConnectionBanner'
import Link from 'next/link'

interface NewConsultationClientProps {
  patient: PatientRow
  appointmentId: string | null
  preclinical?: PreclinicalVitalsRow | null
  consultations?: ConsultationRow[]
  studies?: StudyRow[]
  prescriptions?: PrescriptionRow[]
  currentUserId: string
  currentUserRole: string
  isOrgAdmin: boolean
  labCatalog?: { category: string; tests: string[] }[]
  lastLabOrder?: { tests: { category: string; name: string }[]; other_tests: string | null; created_at: string } | null
  labOrders?: LabOrderRow[]
  studyCatalog?: CatalogSection[]
  lastStudyRequest?: { studies: RequestStudy[]; other_studies: string | null; created_at: string } | null
}

// Tiempo máximo de espera del guardado antes de liberar el botón (~10× el guardado normal de
// 1-2 s). Si la petición sí llegó al servidor pero la respuesta se perdió, el mensaje de error
// le pide al médico verificar el expediente antes de reintentar (trade-off aceptado en el spec:
// sin clave de idempotencia). A los 5 s se muestra un aviso de "tardando más de lo normal" para
// que el médico nunca espere sin señal.
const SAVE_TIMEOUT_MS = 15_000
const SLOW_SAVE_HINT_MS = 5_000

// Campos que se restauran vía estado de React (controlados u ocultos); el resto se escribe
// directo en los inputs no controlados del formulario por su atributo name.
const DRAFT_STATE_FIELDS = new Set([
  'medicines_text',
  'include_diagnosis',
  'prescription_notes',
  'diagnosis',
  'treatment_plan',
  'lab_order',
  'study_request',
])

export default function NewConsultationClient({
  patient,
  appointmentId,
  preclinical = null,
  consultations = [],
  studies = [],
  prescriptions = [],
  currentUserId,
  currentUserRole,
  isOrgAdmin,
  labCatalog = [],
  lastLabOrder = null,
  labOrders = [],
  studyCatalog = [],
  lastStudyRequest = null
}: NewConsultationClientProps) {
  const [error, setError] = useState<string | null>(null)

  const patientAge = calculateAge(patient.birth_date)
  const [loading, setLoading] = useState(false)
  // Guardado lento (>5 s): muestra un aviso junto al botón para que el médico sepa que sigue vivo.
  const [slowSave, setSlowSave] = useState(false)
  const [isUpdatingGender, startGenderTransition] = React.useTransition()
  // Modal para ofrecer imprimir la incapacidad médica al finalizar la consulta
  const [printModal, setPrintModal] = useState<{
    consultationId: string
    prescriptionId: string | null
    labOrderId: string | null
    studyRequestId: string | null
    hasMedicalLeave: boolean
    hasReferral: boolean
    hasPrescription: boolean
    hasLabOrder: boolean
    hasStudyRequest: boolean
  } | null>(null)

  // Orden de laboratorio: se arma en un modal y se mantiene en estado hasta guardar la consulta.
  const [showLabModal, setShowLabModal] = useState(false)
  const [labOrder, setLabOrder] = useState<{ tests: { category: string; name: string }[]; otherTests: string }>({ tests: [], otherTests: '' })
  const labOrderCount = labOrder.tests.length + (labOrder.otherTests.trim() ? 1 : 0)

  // Solicitud de estudios: igual que la orden de laboratorio, se arma en un modal y vive en estado.
  const [showStudyModal, setShowStudyModal] = useState(false)
  const [studyRequest, setStudyRequest] = useState<StudyRequestValue>({ studies: [], otherStudies: '', manualToCatalog: [] })
  const studyRequestCount = studyRequest.studies.length + (studyRequest.otherStudies.trim() ? 1 : 0)

  // Receta en TEXTO LIBRE: un medicamento por línea. Al guardar, cada línea se convierte en
  // un ítem { name }. La consulta previa más reciente sirve de referencia / para reusar.
  const lastPrescription = prescriptions[0]
  const lastConsultation = consultations[0]
  const [medicinesText, setMedicinesText] = useState('')
  const [prescriptionNotes, setPrescriptionNotes] = useState('')
  const [includeDiagnosis, setIncludeDiagnosis] = useState(false)
  const [diagnosisText, setDiagnosisText] = useState('')
  const [treatmentText, setTreatmentText] = useState('')

  const formRef = useRef<HTMLFormElement | null>(null)
  const errorRef = useRef<HTMLDivElement | null>(null)

  // ── Borrador local (autosave + restauración) ─────────────────────────────
  // Snapshot del formulario completo: FormData cubre inputs con name (incluidos los hidden de
  // laboratorio/estudios); se agregan a mano el textarea de medicamentos (sin name) y el
  // checkbox (FormData omite checkboxes desmarcados).
  function getDraftSnapshot(): Record<string, string> {
    const form = formRef.current
    const fields = form ? formDataToFields(new FormData(form)) : {}
    fields.medicines_text = medicinesText
    fields.include_diagnosis = includeDiagnosis ? 'on' : ''
    return fields
  }

  const { pendingDraft, scheduleSave, discardDraft, resolvePendingDraft, clearSavedDraft } =
    useFormDraft(draftKey(currentUserId, patient.id), getDraftSnapshot)

  // Los cambios programáticos (modales de lab/estudios, botones de importar, "usar último")
  // no disparan onInput del form; este efecto los cubre. Se salta el primer render para no
  // guardar un borrador del formulario recién abierto sin tocar.
  const draftMountedRef = useRef(false)
  useEffect(() => {
    if (!draftMountedRef.current) {
      draftMountedRef.current = true
      return
    }
    scheduleSave()
  }, [medicinesText, prescriptionNotes, includeDiagnosis, diagnosisText, treatmentText, labOrder, studyRequest, scheduleSave])

  // El error puede aparecer lejos del botón Guardar (el alert vive arriba del formulario):
  // llevarlo a la vista para que el médico sí lo vea.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error])

  // Aplica un borrador restaurado: estado de React para los campos controlados/ocultos y
  // escritura directa por name para los no controlados.
  function applyDraft(fields: Record<string, string>) {
    setDiagnosisText(fields.diagnosis ?? '')
    setTreatmentText(fields.treatment_plan ?? '')
    setMedicinesText(fields.medicines_text ?? '')
    setPrescriptionNotes(fields.prescription_notes ?? '')
    setIncludeDiagnosis(fields.include_diagnosis === 'on')
    try {
      if (fields.lab_order) {
        const parsed = JSON.parse(fields.lab_order) as { tests?: { category: string; name: string }[]; otherTests?: string }
        setLabOrder({ tests: Array.isArray(parsed?.tests) ? parsed.tests : [], otherTests: parsed?.otherTests || '' })
      }
    } catch {
      // parte corrupta del borrador: se ignora, el resto se restaura igual
    }
    try {
      if (fields.study_request) {
        const parsed = JSON.parse(fields.study_request) as StudyRequestValue
        setStudyRequest({
          studies: Array.isArray(parsed?.studies) ? parsed.studies : [],
          otherStudies: parsed?.otherStudies || '',
          manualToCatalog: Array.isArray(parsed?.manualToCatalog) ? parsed.manualToCatalog : [],
        })
      }
    } catch {
      // idem
    }
    const form = formRef.current
    if (form) {
      for (const [name, value] of Object.entries(fields)) {
        if (DRAFT_STATE_FIELDS.has(name)) continue
        const el = form.elements.namedItem(name)
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = value
      }
    }
    resolvePendingDraft()
  }

  // Cargar los medicamentos (y notas) de la última receta del paciente al textarea.
  function loadLastPrescription() {
    if (!lastPrescription) return
    setMedicinesText(medicinesToText(lastPrescription.medicines || []))
    if (lastPrescription.notes) setPrescriptionNotes(lastPrescription.notes)
  }

  // Manejar el submit del formulario completo
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(event.currentTarget)
    const medicines = parseMedicinesText(medicinesText)

    // Si el guardado tarda más de lo normal (petición colgada, servidor lento), avisar al médico
    // en vez de dejarlo mirando el spinner sin señal.
    const slowTimer = setTimeout(() => setSlowSave(true), SLOW_SAVE_HINT_MS)

    let result: Awaited<ReturnType<typeof createConsultation>>
    try {
      // Promise.race: si la red se cayó a media petición el fetch puede quedarse colgado sin
      // rechazar nunca; el timeout libera el botón para que el médico pueda reintentar.
      result = await Promise.race([
        createConsultation(patient.id, appointmentId, medicines, formData, preclinical?.id ?? null),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('SAVE_TIMEOUT')), SAVE_TIMEOUT_MS)
        }),
      ])
    } catch {
      // Fallo de red o timeout: la consulta NO se guardó (desde el punto de vista del cliente).
      // Los datos siguen en el formulario y el borrador local sigue vivo; reintentar es volver
      // a presionar el mismo botón.
      setLoading(false)
      setError(
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? 'Sin conexión a internet. La consulta NO se guardó, pero tus datos están respaldados en este dispositivo. Revisa tu conexión e inténtalo de nuevo.'
          : 'No se pudo guardar la consulta. Revisa tu conexión e inténtalo de nuevo. Si el problema persiste, verifica en el expediente si la consulta ya quedó registrada antes de volver a guardar.'
      )
      return
    } finally {
      // Corre en todos los caminos (éxito, error o timeout): apaga el aviso de guardado lento.
      clearTimeout(slowTimer)
      setSlowSave(false)
    }

    if (result && 'error' in result && result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    const r = result && 'success' in result ? result : null

    // Guardado exitoso: el borrador local ya no hace falta (política: borrar al guardar).
    clearSavedDraft()

    // Avisos de pasos secundarios que fallaron (la consulta sí se guardó). No bloquean el flujo,
    // pero el médico debe enterarse en vez de recibir un "éxito" silencioso con estado parcial.
    if (r?.warnings?.length) {
      window.alert('La consulta se guardó, pero hubo avisos:\n\n• ' + r.warnings.join('\n• '))
    }

    // Si hay receta, incapacidad, orden de laboratorio y/o solicitud de estudios, ofrecer imprimir antes de salir.
    if (r && (r.hasMedicalLeave || r.hasReferral || r.hasPrescription || r.hasLabOrder || r.hasStudyRequest)) {
      setPrintModal({
        consultationId: r.consultationId,
        prescriptionId: r.prescriptionId ?? null,
        labOrderId: r.labOrderId ?? null,
        studyRequestId: r.studyRequestId ?? null,
        hasMedicalLeave: !!r.hasMedicalLeave,
        hasReferral: !!r.hasReferral,
        hasPrescription: !!r.hasPrescription,
        hasLabOrder: !!r.hasLabOrder,
        hasStudyRequest: !!r.hasStudyRequest,
      })
      return
    }

    // Sin documentos que imprimir: navegar directo al expediente del paciente.
    window.location.href = `/dashboard/patients/${patient.id}`
  }

  return (
    <div style={styles.container}>
      {/* Aviso en vivo si se pierde la conexión (el fetch del guardado es la señal definitiva) */}
      <ConnectionBanner />

      {/* Pregunta de resumen del historial (solo si el paciente ya tiene consultas previas) */}
      <HistorySummaryModals patient={patient} consultations={consultations} />

      {/* Modal de orden de laboratorio */}
      {showLabModal && (
        <LabOrderModal
          catalog={labCatalog}
          initial={labOrder}
          onSave={(v) => { setLabOrder(v); setShowLabModal(false) }}
          onClose={() => setShowLabModal(false)}
        />
      )}

      {/* Modal de solicitud de estudios */}
      {showStudyModal && (
        <StudyRequestModal
          catalog={studyCatalog}
          initial={studyRequest}
          onSave={(v) => { setStudyRequest(v); setShowStudyModal(false) }}
          onClose={() => setShowStudyModal(false)}
        />
      )}

      {/* Modal: ofrecer imprimir receta y/o incapacidad al finalizar.
          Cada botón abre su impresión en pestaña nueva y el cuadro queda abierto,
          así el médico puede imprimir ambas, una, o ninguna. */}
      {printModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3 style={styles.modalTitle}>Consulta registrada</h3>
            <p style={styles.modalText}>
              Se generaron documentos para este paciente. Imprime los que necesites:
            </p>
            <div style={{ ...styles.modalActions, flexDirection: 'column' }}>
              {printModal.hasPrescription && printModal.prescriptionId && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', gap: '0.4rem' }}
                  onClick={() => window.open(`/prescriptions/${printModal.prescriptionId}/print`, '_blank')}
                >
                  <Printer size={16} />
                  Imprimir Receta
                </button>
              )}
              {printModal.hasMedicalLeave && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', gap: '0.4rem' }}
                  onClick={() => window.open(`/consultations/${printModal.consultationId}/print`, '_blank')}
                >
                  <Printer size={16} />
                  Imprimir Incapacidad
                </button>
              )}
              {printModal.hasReferral && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', gap: '0.4rem' }}
                  onClick={() => window.open(`/consultations/${printModal.consultationId}/print?doc=referral`, '_blank')}
                >
                  <Printer size={16} />
                  Imprimir Referencia
                </button>
              )}
              {printModal.hasLabOrder && printModal.labOrderId && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', gap: '0.4rem' }}
                  onClick={() => window.open(`/lab-orders/${printModal.labOrderId}/print`, '_blank')}
                >
                  <Printer size={16} />
                  Imprimir Orden de Laboratorio
                </button>
              )}
              {printModal.hasStudyRequest && printModal.studyRequestId && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', gap: '0.4rem' }}
                  onClick={() => window.open(`/study-requests/${printModal.studyRequestId}/print`, '_blank')}
                >
                  <Printer size={16} />
                  Imprimir Solicitud de Estudios
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%' }}
                onClick={() => { window.location.href = `/dashboard/patients/${patient.id}` }}
              >
                Ir al Expediente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={styles.headerRow}>
        <Link href={`/dashboard/patients/${patient.id}`} style={styles.backLink}>
          <ChevronLeft size={16} />
          Volver al Expediente del Paciente
        </Link>
        <h2 style={styles.title}>Nueva Consulta Clínica</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <p style={{ ...styles.subtitle, fontSize: '1.1rem', margin: 0 }}>
            Paciente: <strong style={{ fontSize: '1.2rem', color: 'var(--text-main)' }}>{patient.first_name} {patient.last_name}</strong>
          </p>
          {patient.is_pediatric && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              backgroundColor: '#dcfce7',
              color: '#166534',
              border: '1px solid #bbf7d0',
              borderRadius: '999px',
              padding: '0.2rem 0.75rem',
              fontSize: '0.8rem',
              fontWeight: '700',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
            }}>
              Pediátrico
            </span>
          )}
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            backgroundColor: '#e2e8f0',
            color: '#334155',
            border: '1px solid #cbd5e1',
            borderRadius: '999px',
            padding: '0.2rem 0.75rem',
            fontSize: '0.8rem',
            fontWeight: '700',
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
          }}>
            {patientAge} años
          </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-muted)' }}>Género:</span>
            <select
              value={patient.gender || 'O'}
              disabled={isUpdatingGender}
              onChange={(e) => {
                startGenderTransition(async () => {
                  await updatePatientGender(patient.id, e.target.value)
                })
              }}
              style={{
                appearance: 'none',
                cursor: 'pointer',
                backgroundColor: patient.gender === 'F' ? '#fdf2f8' : patient.gender === 'M' ? '#eff6ff' : '#f8fafc',
                color: patient.gender === 'F' ? '#be185d' : patient.gender === 'M' ? '#1d4ed8' : '#475569',
                border: `1px solid ${patient.gender === 'F' ? '#fbcfe8' : patient.gender === 'M' ? '#bfdbfe' : '#e2e8f0'}`,
                borderRadius: '999px',
                padding: '0.2rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: '700',
                letterSpacing: '0.02em',
                outline: 'none',
                opacity: isUpdatingGender ? 0.6 : 1
              }}
            >
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
              <option value="O">Otro</option>
            </select>
          </div>
        </div>
      </div>

      {error && <div ref={errorRef} style={styles.errorAlert}>{error}</div>}

      {/* Borrador local encontrado: ofrecer recuperarlo antes de que el médico escriba de nuevo.
          Mientras este banner espera decisión, el autosave está pausado. */}
      {pendingDraft && (
        <div style={styles.draftBanner}>
          <div>
            <strong style={{ display: 'block', fontSize: '0.9rem' }}>Encontramos una consulta sin guardar</strong>
            <span style={{ fontSize: '0.8rem' }}>
              Respaldada en este dispositivo el {formatDateTimeHN(new Date(pendingDraft.savedAt).toISOString())}. ¿Quieres recuperarla?
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button type="button" className="btn btn-primary" onClick={() => applyDraft(pendingDraft.fields)}>
              Restaurar
            </button>
            <button type="button" className="btn btn-secondary" onClick={discardDraft}>
              Descartar
            </button>
          </div>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} onInput={scheduleSave} style={styles.form}>
            
            {/* 1. Signos Vitales */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={styles.sectionTitle}>
                <Heart size={18} color="var(--primary)" />
                Signos Vitales
              </h3>
              {preclinical && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.85rem', marginBottom: '1rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', fontSize: '0.85rem', color: '#065f46' }}>
                  <Stethoscope size={16} color="#059669" style={{ flexShrink: 0 }} />
                  <span>
                    🩺 Signos tomados en pre-clínica
                    {(preclinical.recorded_by_profile?.first_name || preclinical.recorded_by_profile?.last_name)
                      ? ` por ${[preclinical.recorded_by_profile?.first_name, preclinical.recorded_by_profile?.last_name].filter(Boolean).join(' ')}`
                      : ''}
                    {' · '}{formatDateTimeHN(preclinical.created_at)} — importados; ajústalos si es necesario.
                  </span>
                </div>
              )}
              <div style={styles.vitalsGrid}>
                <div className="form-group">
                  <label className="form-label">Presión Arterial</label>
                  <input className="form-input" name="blood_pressure" placeholder="Ej. 120/80" defaultValue={preclinical?.blood_pressure || ''} />
                </div>
                <div className="form-group">
                  <label className="form-label">Temperatura (°C)</label>
                  <input className="form-input" type="number" step="0.1" name="temperature" placeholder="Ej. 36.8" defaultValue={preclinical?.temperature ?? ''} />
                </div>
                <div className="form-group">
                  <label className="form-label">Peso (kg)</label>
                  <input className="form-input" type="number" step="0.01" name="weight" placeholder="Ej. 70.5" defaultValue={preclinical?.weight ?? ''} />
                </div>
                <div className="form-group">
                  <label className="form-label">Talla (cm)</label>
                  <input className="form-input" type="number" step="0.1" name="height" placeholder="Ej. 175.5" defaultValue={preclinical?.height ?? ''} />
                </div>
                {patient.is_pediatric && (
                  <div className="form-group">
                    <label className="form-label">Perímetro Cefálico (cm)</label>
                    <input className="form-input" type="number" step="0.1" name="head_circumference" placeholder="Ej. 48.5" defaultValue={preclinical?.head_circumference ?? ''} />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Ritmo Cardiaco (bpm)</label>
                  <input className="form-input" type="number" name="heart_rate" placeholder="Ej. 72" defaultValue={preclinical?.heart_rate ?? ''} />
                </div>
                <div className="form-group">
                  <label className="form-label">Frecuencia Respiratoria (rpm)</label>
                  <input className="form-input" type="number" name="respiratory_rate" placeholder="Ref. 12-20" defaultValue={preclinical?.respiratory_rate ?? ''} />
                </div>
                <div className="form-group">
                  <label className="form-label">SpO2 (%)</label>
                  <input className="form-input" type="number" name="oxygen_saturation" placeholder="Ej. 98" defaultValue={preclinical?.oxygen_saturation ?? ''} />
                </div>
              </div>
            </div>

            {/* 1.b Antecedentes del paciente (pre-llenados desde el expediente; editables → se guardan al registrar) */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={styles.sectionTitle}>
                <Clipboard size={18} color="var(--primary)" />
                Antecedentes del Paciente
              </h3>
              <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Información actual del expediente. Edítala si hay cambios; lo que dejes aquí se guardará en el expediente del paciente al registrar la consulta.
              </p>
              <div className="form-group">
                <label className="form-label">Alergias</label>
                {/* "Ninguna conocida" era el valor por defecto antiguo: se trata como vacío para mostrar
                    el ejemplo. Cualquier otro texto del médico (incluido "Ninguna" o "No") sí se conserva. */}
                <textarea className="form-input" name="allergies" rows={2} defaultValue={patient.allergies === 'Ninguna conocida' ? '' : (patient.allergies || '')} placeholder="Especifica medicamentos, alimentos, polen, etc." />
              </div>
              <div className="form-group">
                <label className="form-label">Antecedentes Patológicos</label>
                <textarea className="form-input" name="pathological_history" rows={2} defaultValue={patient.pathological_history || ''} placeholder="Enfermedades, cirugías, hospitalizaciones…" />
              </div>
              <div className="form-group">
                <label className="form-label">Antecedentes No Patológicos</label>
                <textarea className="form-input" name="non_pathological_history" rows={2} defaultValue={patient.non_pathological_history || ''} placeholder="Hábitos, tabaco, alcohol, alimentación…" />
              </div>
              <div className="form-group">
                <label className="form-label">Antecedentes Heredofamiliares</label>
                <textarea className="form-input" name="family_history" rows={2} defaultValue={patient.family_history || ''} placeholder="Antecedentes familiares relevantes…" />
              </div>
            </div>

            {/* 2. Notas Clínicas */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={styles.sectionTitle}>
                <Stethoscope size={18} color="var(--primary)" />
                Evolución Clínica
              </h3>
              
              <div className="form-group">
                <label className="form-label">Motivo de Consulta *</label>
                <textarea 
                  className="form-input" 
                  name="reason_for_visit" 
                  placeholder="Por qué asiste el paciente..." 
                  rows={2} 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Sintomatología / Anamnesis</label>
                <textarea 
                  className="form-input" 
                  name="symptoms" 
                  placeholder="Detalles sobre los síntomas informados..." 
                  rows={2} 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Resultados de exámenes de laboratorios/estudios</label>
                <textarea
                  className="form-input"
                  name="physical_exam"
                  placeholder="Resultados o notas sobre estudios o exámenes médicos..."
                  rows={2}
                />
              </div>


            </div>

            {/* 3. Diagnóstico y Plan */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={styles.sectionTitle}>
                <Clipboard size={18} color="var(--primary)" />
                Diagnóstico y Tratamiento
              </h3>
              
              <div className="form-group">
                <label className="form-label">Diagnóstico *</label>
                <textarea
                  className="form-input"
                  name="diagnosis"
                  value={diagnosisText}
                  onChange={(e) => setDiagnosisText(e.target.value)}
                  placeholder="Diagnóstico clínico (CIE-10 o descripción detallada)..."
                  rows={2}
                  required
                  style={{ borderLeft: '3px solid var(--primary)' }}
                />
                {lastConsultation?.diagnosis && (
                  <LastValueRef
                    label={`Último diagnóstico · ${formatDateHN(lastConsultation.created_at)}`}
                    value={lastConsultation.diagnosis}
                    onUse={() => setDiagnosisText(lastConsultation.diagnosis || '')}
                  />
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Plan de Tratamiento / Recomendaciones *</label>
                <textarea
                  className="form-input"
                  name="treatment_plan"
                  value={treatmentText}
                  onChange={(e) => setTreatmentText(e.target.value)}
                  placeholder="Instrucciones generales de cuidado, reposo, dieta..."
                  rows={3}
                  required
                />
                {lastConsultation?.treatment_plan && (
                  <LastValueRef
                    label={`Último plan de tratamiento · ${formatDateHN(lastConsultation.created_at)}`}
                    value={lastConsultation.treatment_plan}
                    onUse={() => setTreatmentText(lastConsultation.treatment_plan || '')}
                  />
                )}
              </div>
            </div>

            {/* 4. Prescribir Receta Médica */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={styles.sectionTitle}>
                <Pill size={18} color="var(--secondary)" />
                Prescribir Receta Médica
              </h3>

              {/* Medicamentos en TEXTO LIBRE: un medicamento por línea */}
              <div style={styles.medAddForm}>
                <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                  <label className="form-label" style={{ margin: 0 }}>Medicamentos</label>
                  {lastPrescription && (
                    <button type="button" onClick={loadLastPrescription} className="btn" style={{ padding: "0.3rem 0.7rem", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "0.35rem", backgroundColor: '#f0fdfa', border: '1px solid #99f6e4', color: '#0f766e', fontWeight: 600 }}>
                      <Clipboard size={14} /> Importar última receta
                    </button>
                  )}
                </div>
                <textarea
                  className="form-input"
                  value={medicinesText}
                  onChange={(e) => setMedicinesText(e.target.value)}
                  placeholder={`Escribe un medicamento por línea. Ejemplo:\nCARDIOASPIRINA 81 MG VO CADA DIA. 12 MD\nLIPITOR 40 MG VO CADA DIA. 6 PM\nEUTIROX NF 50 MCG VO 1 TABLETA CADA DIA, EN AYUNO`}
                  rows={9}
                  style={{ resize: "vertical", fontSize: "0.9rem", lineHeight: 1.5 }}
                />
                <p style={{ margin: "0.4rem 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  Un medicamento por línea (nombre, dosis, frecuencia, duración). Se numeran solos en la receta.
                </p>
              </div>

              {/* Indicaciones de la receta */}
              <div className="form-group" style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <label className="form-label">Notas Adicionales de la Receta</label>
                <textarea
                  className="form-input"
                  name="prescription_notes"
                  value={prescriptionNotes}
                  onChange={(e) => setPrescriptionNotes(e.target.value)}
                  placeholder="Indicaciones adicionales de toma o advertencias..."
                  rows={2}
                />
              </div>

              {/* Incluir el diagnóstico de la consulta en la receta (opcional) */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginTop: '0.75rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  name="include_diagnosis"
                  checked={includeDiagnosis}
                  onChange={(e) => setIncludeDiagnosis(e.target.checked)}
                  style={{ marginTop: '0.2rem', width: '16px', height: '16px', flexShrink: 0, cursor: 'pointer' }}
                />
                <span>
                  <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>Incluir el diagnóstico de la consulta en la receta</span>
                  <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Algunas aseguradoras lo requieren.</span>
                </span>
              </label>
            </div>

            {/* 5. Laboratorio y Estudios */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={styles.sectionTitle}>
                <FlaskConical size={18} color="var(--primary)" />
                Laboratorio y Estudios
              </h3>

              <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>Orden de Laboratorio</div>

              <input type="hidden" name="lab_order" value={JSON.stringify(labOrder)} />

              {labOrderCount === 0 ? (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowLabModal(true)}
                    style={{ gap: '0.45rem', backgroundColor: '#f0fdfa', border: '1px solid #99f6e4', color: '#0f766e', fontWeight: 600 }}
                  >
                    <FlaskConical size={16} />
                    Generar Nueva Orden de Laboratorio
                  </button>
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Selecciona los exámenes que el paciente debe realizarse.
                  </p>
                </>
              ) : (
                <div style={{ padding: '0.85rem 1rem', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 700, color: '#0f766e' }}>
                      <FlaskConical size={16} />
                      {labOrderCount} {labOrderCount === 1 ? 'examen seleccionado' : 'exámenes seleccionados'}
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem' }} onClick={() => setShowLabModal(true)}>Editar</button>
                      <button type="button" className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem' }} onClick={() => setLabOrder({ tests: [], otherTests: '' })}>Quitar</button>
                    </div>
                  </div>
                  <LabOrderList tests={labOrder.tests} otherTests={labOrder.otherTests} />
                </div>
              )}

              {/* Referencia: última orden de laboratorio del paciente (cita anterior) */}
              {lastLabOrder && Array.isArray(lastLabOrder.tests) && (lastLabOrder.tests.length > 0 || (lastLabOrder.other_tests || '').trim()) && (
                <div style={{ marginTop: '0.85rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 0.9rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#0f766e', backgroundColor: 'rgba(13,148,136,0.12)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                      Última orden · {formatDateHN(lastLabOrder.created_at)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLabOrder({ tests: lastLabOrder.tests || [], otherTests: lastLabOrder.other_tests || '' })}
                      style={{ flexShrink: 0, background: 'none', border: '1px solid #99f6e4', color: '#0d9488', borderRadius: '6px', padding: '0.15rem 0.6rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Importar
                    </button>
                  </div>
                  <LabOrderList tests={lastLabOrder.tests} otherTests={lastLabOrder.other_tests} />
                </div>
              )}

              {/* Solicitud de Estudios (misma tarjeta, debajo del laboratorio) */}
              <div style={{ height: '1px', background: 'var(--border-color)', margin: '1.25rem 0' }} />
              <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>Solicitud de Estudios</div>

              <input type="hidden" name="study_request" value={JSON.stringify(studyRequest)} />

              {studyRequestCount === 0 ? (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowStudyModal(true)}
                    style={{ gap: '0.45rem', backgroundColor: '#f0fdfa', border: '1px solid #99f6e4', color: '#0f766e', fontWeight: 600 }}
                  >
                    <ClipboardList size={16} />
                    Generar Solicitud de Estudios
                  </button>
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Selecciona los estudios que el paciente debe realizarse (radiología, cardiología, etc.).
                  </p>
                </>
              ) : (
                <div style={{ padding: '0.85rem 1rem', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 700, color: '#0f766e' }}>
                      <ClipboardList size={16} />
                      {studyRequestCount} {studyRequestCount === 1 ? 'estudio seleccionado' : 'estudios seleccionados'}
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem' }} onClick={() => setShowStudyModal(true)}>Editar</button>
                      <button type="button" className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem' }} onClick={() => setStudyRequest({ studies: [], otherStudies: '', manualToCatalog: [] })}>Quitar</button>
                    </div>
                  </div>
                  <StudyRequestList studies={studyRequest.studies} otherStudies={studyRequest.otherStudies} />
                </div>
              )}

              {/* Referencia: última solicitud de estudios del paciente (cita anterior) */}
              {lastStudyRequest && Array.isArray(lastStudyRequest.studies) && (lastStudyRequest.studies.length > 0 || (lastStudyRequest.other_studies || '').trim()) && (
                <div style={{ marginTop: '0.85rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 0.9rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#0f766e', backgroundColor: 'rgba(13,148,136,0.12)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                      Última solicitud · {formatDateHN(lastStudyRequest.created_at)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setStudyRequest({ studies: lastStudyRequest.studies || [], otherStudies: lastStudyRequest.other_studies || '', manualToCatalog: [] })}
                      style={{ flexShrink: 0, background: 'none', border: '1px solid #99f6e4', color: '#0d9488', borderRadius: '6px', padding: '0.15rem 0.6rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Importar
                    </button>
                  </div>
                  <StudyRequestList studies={lastStudyRequest.studies} otherStudies={lastStudyRequest.other_studies} />
                </div>
              )}
            </div>

            {/* 6. Incapacidad Médica */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={styles.sectionTitle}>
                <Activity size={18} color="var(--primary)" />
                Incapacidad Médica
              </h3>
              
              <div className="form-group" style={{ marginBottom: 0 }}>
                <textarea
                  className="form-input"
                  name="medical_leave"
                  placeholder="Días de incapacidad y motivo (si aplica)..."
                  rows={3}
                />
              </div>
            </div>

            {/* 7. Referencia Médica (referir a otro médico/hospital) */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={styles.sectionTitle}>
                <Activity size={18} color="var(--primary)" />
                Referencia Médica
              </h3>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <textarea
                  className="form-input"
                  name="referral"
                  placeholder="Motivo de la referencia y a quién/dónde se refiere (si aplica)..."
                  rows={3}
                />
              </div>
            </div>

              {/* Botón de Enviar */}
              <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                  style={{ gap: '0.5rem' }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                      Guardando Consulta...
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      Finalizar Consulta & Recetar
                    </>
                  )}
                </button>
                {loading && slowSave && (
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Esto está tardando más de lo normal…
                  </span>
                )}
              </div>
      </form>

      {/* HISTORIAL MÉDICO DEL PACIENTE */}
      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '1.5rem', paddingBottom: '0.5rem', borderBottom: '2px solid var(--border-color)' }}>
          Expediente Médico de {patient.first_name}
        </h2>
        <PatientHistoryTabs
          patient={patient}
          consultations={consultations}
          studies={studies}
          prescriptions={prescriptions}
          labOrders={labOrders}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          isOrgAdmin={isOrgAdmin}
        />
      </div>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  headerRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    color: 'var(--primary)',
    fontSize: '0.85rem',
    fontWeight: '600',
    textDecoration: 'none',
    width: 'fit-content',
    marginBottom: '0.5rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: '700',
  },
  subtitle: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
  },
  errorAlert: {
    padding: '0.75rem 1rem',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '8px',
    color: '#f87171',
    fontSize: '0.85rem',
  },
  draftBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '0.75rem',
    padding: '0.85rem 1rem',
    backgroundColor: '#fffbeb',
    border: '1px solid #fcd34d',
    borderRadius: '10px',
    color: '#92400e',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
  },
  layoutGrid: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1fr',
    gap: '1.5rem',
    alignItems: 'stretch',
  },
  mainColumn: {
    display: 'flex',
    flexDirection: 'column',
  },
  sideColumn: {
    display: 'flex',
    flexDirection: 'column',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '1.25rem',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '0.5rem',
  },
  vitalsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
    gap: '0.75rem',
    // Alinea los inputs por abajo aunque algún label (Perímetro Cefálico, Ritmo
    // Cardiaco) ocupe dos líneas y empuje su campo hacia abajo.
    alignItems: 'end',
  },
  medAddForm: {
    backgroundColor: 'var(--bg-input)',
    padding: '1rem',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    marginBottom: '1rem',
  },
  medsListWrapper: {
    flex: 1,
    overflowY: 'auto',
    maxHeight: '220px',
    marginBottom: '1rem',
  },
  medsListTitle: {
    fontSize: '0.85rem',
    fontWeight: '700',
    color: 'var(--text-main)',
    marginBottom: '0.5rem',
  },
  emptyMedsText: {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  medsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  medItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.6rem 0.85rem',
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
  },
  medDetails: {
    flex: 1,
  },
  medNameText: {
    fontSize: '0.85rem',
    fontWeight: '700',
  },
  medInstructions: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  },
  medRemoveBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '0.25rem',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: '14px',
    padding: '1.75rem',
    maxWidth: '440px',
    width: '100%',
    boxShadow: '0 20px 50px rgba(15,23,42,0.3)',
  },
  modalTitle: {
    fontSize: '1.15rem',
    fontWeight: 700,
    margin: '0 0 0.5rem',
    color: '#0f172a',
  },
  modalText: {
    fontSize: '0.9rem',
    color: '#475569',
    lineHeight: 1.55,
    margin: '0 0 1.5rem',
  },
  modalActions: {
    display: 'flex',
    gap: '0.75rem',
  },
}
