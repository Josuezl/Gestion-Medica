'use client'

import React, { useState } from 'react'
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
  Printer
} from 'lucide-react'
import PatientHistoryTabs from '../../components/PatientHistoryTabs'
import { calculateAge } from '@/utils/age'
import { parseMedicinesText, medicinesToText } from '@/utils/medicines'
import { formatDateHN } from '@/utils/datetime'

interface NewConsultationClientProps {
  patient: any
  appointmentId: string | null
  consultations?: any[]
  studies?: any[]
  prescriptions?: any[]
  currentUserId: string
  currentUserRole: string
  isOrgAdmin: boolean
}

/** Tarjeta de referencia con el último valor (diagnóstico/plan) + botón "Usar". */
function LastValueRef({ label, value, onUse }: { label: string; value: string; onUse: () => void }) {
  return (
    <div style={{ marginTop: '0.5rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '1rem', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8' }}>{label}</span>
        <button type="button" onClick={onUse} style={{ flexShrink: 0, background: 'none', border: '1px solid #99f6e4', color: '#0d9488', borderRadius: '6px', padding: '0.15rem 0.6rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Usar</button>
      </div>
      <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{value}</p>
    </div>
  )
}

export default function NewConsultationClient({
  patient,
  appointmentId,
  consultations = [],
  studies = [],
  prescriptions = [],
  currentUserId,
  currentUserRole,
  isOrgAdmin
}: NewConsultationClientProps) {
  const [error, setError] = useState<string | null>(null)
  
  const patientAge = calculateAge(patient.birth_date)
  const [loading, setLoading] = useState(false)
  const [isUpdatingGender, startGenderTransition] = React.useTransition()
  // Modal para ofrecer imprimir la incapacidad médica al finalizar la consulta
  const [printModal, setPrintModal] = useState<{
    consultationId: string
    prescriptionId: string | null
    hasMedicalLeave: boolean
    hasPrescription: boolean
  } | null>(null)

  // Receta en TEXTO LIBRE: un medicamento por línea. Al guardar, cada línea se convierte en
  // un ítem { name }. La consulta previa más reciente sirve de referencia / para reusar.
  const lastPrescription = prescriptions[0]
  const lastConsultation = consultations[0]
  const [medicinesText, setMedicinesText] = useState('')
  const [prescriptionNotes, setPrescriptionNotes] = useState('')
  const [includeDiagnosis, setIncludeDiagnosis] = useState(false)
  const [diagnosisText, setDiagnosisText] = useState('')
  const [treatmentText, setTreatmentText] = useState('')

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
    const result = await createConsultation(patient.id, appointmentId, medicines, formData)

    if (result && (result as any).error) {
      setError((result as any).error)
      setLoading(false)
      return
    }

    // Si hay receta y/o incapacidad, ofrecer imprimir antes de salir.
    const r = result as any
    if (r && (r.hasMedicalLeave || r.hasPrescription)) {
      setPrintModal({
        consultationId: r.consultationId,
        prescriptionId: r.prescriptionId ?? null,
        hasMedicalLeave: !!r.hasMedicalLeave,
        hasPrescription: !!r.hasPrescription,
      })
      return
    }

    // Sin documentos que imprimir: navegar directo al expediente del paciente.
    window.location.href = `/dashboard/patients/${patient.id}`
  }

  return (
    <div style={styles.container}>
      {/* Modal: ofrecer imprimir receta y/o incapacidad al finalizar.
          Cada botón abre su impresión en pestaña nueva y el cuadro queda abierto,
          así el médico puede imprimir ambas, una, o ninguna. */}
      {printModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3 style={styles.modalTitle}>Consulta registrada</h3>
            <p style={styles.modalText}>
              {printModal.hasPrescription && printModal.hasMedicalLeave
                ? <>Se generaron una <strong>receta médica</strong> y una <strong>incapacidad médica</strong>. Imprime los documentos que necesites:</>
                : printModal.hasPrescription
                  ? <>Se generó una <strong>receta médica</strong> para este paciente. ¿Deseas imprimirla ahora?</>
                  : <>Se registró una <strong>incapacidad médica</strong> para este paciente. ¿Deseas imprimirla ahora?</>}
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
        <a href={`/dashboard/patients/${patient.id}`} style={styles.backLink}>
          <ChevronLeft size={16} />
          Volver al Expediente del Paciente
        </a>
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

      {error && <div style={styles.errorAlert}>{error}</div>}

      <form onSubmit={handleSubmit} style={styles.form}>
            
            {/* 1. Signos Vitales */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={styles.sectionTitle}>
                <Heart size={18} color="var(--primary)" />
                Signos Vitales
              </h3>
              <div style={styles.vitalsGrid}>
                <div className="form-group">
                  <label className="form-label">Presión Arterial</label>
                  <input className="form-input" name="blood_pressure" placeholder="Ej. 120/80" />
                </div>
                <div className="form-group">
                  <label className="form-label">Temperatura (°C)</label>
                  <input className="form-input" type="number" step="0.1" name="temperature" placeholder="Ej. 36.8" />
                </div>
                <div className="form-group">
                  <label className="form-label">Peso (kg)</label>
                  <input className="form-input" type="number" step="0.01" name="weight" placeholder="Ej. 70.5" />
                </div>
                <div className="form-group">
                  <label className="form-label">Talla (cm)</label>
                  <input className="form-input" type="number" step="0.1" name="height" placeholder="Ej. 175.5" />
                </div>
                {patient.is_pediatric && (
                  <div className="form-group">
                    <label className="form-label">Perímetro Cefálico (cm)</label>
                    <input className="form-input" type="number" step="0.1" name="head_circumference" placeholder="Ej. 48.5" />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Ritmo Cardiaco (bpm)</label>
                  <input className="form-input" type="number" name="heart_rate" placeholder="Ej. 72" />
                </div>
                <div className="form-group">
                  <label className="form-label">SpO2 (%)</label>
                  <input className="form-input" type="number" name="oxygen_saturation" placeholder="Ej. 98" />
                </div>
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
                    onUse={() => setDiagnosisText(lastConsultation.diagnosis)}
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
                    onUse={() => setTreatmentText(lastConsultation.treatment_plan)}
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
                    <button type="button" onClick={loadLastPrescription} className="btn btn-secondary" style={{ padding: "0.3rem 0.7rem", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <Clipboard size={14} /> Cargar última receta
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

            {/* 5. Incapacidad Médica */}
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

              {/* Botón de Enviar */}
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '1.5rem' }}>
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
