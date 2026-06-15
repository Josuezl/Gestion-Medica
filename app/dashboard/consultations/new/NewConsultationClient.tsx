'use client'

import React, { useState } from 'react'
import { createConsultation } from '../actions'
import { 
  Heart, 
  Activity, 
  Stethoscope, 
  Clipboard, 
  Pill, 
  Plus, 
  Trash2, 
  ChevronLeft,
  Save,
  Loader2,
  Printer
} from 'lucide-react'
import PatientHistoryTabs from '../../components/PatientHistoryTabs'
import { calculateAge } from '@/utils/age'

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

interface MedicineItem {
  name: string
  dose: string
  frequency: string
  duration: string
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
  // Modal para ofrecer imprimir la incapacidad médica al finalizar la consulta
  const [printModal, setPrintModal] = useState<{
    consultationId: string
    prescriptionId: string | null
    hasMedicalLeave: boolean
    hasPrescription: boolean
  } | null>(null)

  // Estado para la lista de medicamentos de la receta
  const [medicines, setMedicines] = useState<MedicineItem[]>([])
  
  // Estados para el medicamento en edición
  const [medName, setMedName] = useState('')
  const [medDose, setMedDose] = useState('')
  const [medFreq, setMedFreq] = useState('')
  const [medDur, setMedDur] = useState('')

  // Agregar un medicamento a la lista
  function handleAddMedicine() {
    if (!medName.trim()) {
      alert('Por favor ingresa el nombre del medicamento.')
      return
    }
    const newItem: MedicineItem = {
      name: medName,
      dose: medDose || 'N/A',
      frequency: medFreq || 'N/A',
      duration: medDur || 'N/A'
    }
    setMedicines([...medicines, newItem])
    
    // Limpiar campos de medicamento
    setMedName('')
    setMedDose('')
    setMedFreq('')
    setMedDur('')
  }

  // Eliminar un medicamento de la lista
  function handleRemoveMedicine(index: number) {
    setMedicines(medicines.filter((_, idx) => idx !== index))
  }

  // Manejar el submit del formulario completo
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(event.currentTarget)
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
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>• Registro de evolución y receta</span>
        </div>
      </div>

      {error && <div style={styles.errorAlert}>{error}</div>}

      <form onSubmit={handleSubmit} style={styles.form}>
        <div className="responsive-main-side">
          {/* Left Column: Signos Vitales & Notas Clínicas */}
          <div style={styles.mainColumn}>
            
            {/* 1. Signos Vitales */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={styles.sectionTitle}>
                <Heart size={18} color="var(--primary)" />
                Signos Vitales
              </h3>
              <div style={styles.vitalsGrid}>
                <div className="form-group">
                  <label className="form-label">Presión Arterial</label>
                  <input className="form-input" name="blood_pressure" placeholder="Ej. 120/80 mmHg" />
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
            <div className="card">
              <h3 style={styles.sectionTitle}>
                <Clipboard size={18} color="var(--primary)" />
                Diagnóstico y Tratamiento
              </h3>
              
              <div className="form-group">
                <label className="form-label">Diagnóstico *</label>
                <textarea 
                  className="form-input" 
                  name="diagnosis" 
                  placeholder="Diagnóstico clínico (CIE-10 o descripción detallada)..." 
                  rows={2} 
                  required 
                  style={{ borderLeft: '3px solid var(--primary)' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Plan de Tratamiento / Recomendaciones *</label>
                <textarea 
                  className="form-input" 
                  name="treatment_plan" 
                  placeholder="Instrucciones generales de cuidado, reposo, dieta..." 
                  rows={3} 
                  required 
                />
              </div>
            </div>

            {/* 4. Incapacidad Médica */}
            <div className="card" style={{ marginTop: '1.5rem' }}>
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
          </div>

          {/* Right Column: Receta Médica Dinámica */}
          <div style={styles.sideColumn}>
            <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <h3 style={styles.sectionTitle}>
                <Pill size={18} color="var(--secondary)" />
                Prescribir Receta Médica
              </h3>

              {/* Formulario rápido para añadir medicamento a la receta */}
              <div style={styles.medAddForm}>
                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                  <label className="form-label">Medicamento</label>
                  <input 
                    className="form-input" 
                    placeholder="Ej. Acetaminofén" 
                    value={medName}
                    onChange={(e) => setMedName(e.target.value)}
                  />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Dosis</label>
                    <input 
                      className="form-input" 
                      placeholder="Ej. 500 mg" 
                      value={medDose}
                      onChange={(e) => setMedDose(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Duración</label>
                    <input 
                      className="form-input" 
                      placeholder="Ej. 5 días" 
                      value={medDur}
                      onChange={(e) => setMedDur(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Frecuencia</label>
                  <input 
                    className="form-input" 
                    placeholder="Ej. Cada 8 horas" 
                    value={medFreq}
                    onChange={(e) => setMedFreq(e.target.value)}
                  />
                </div>

                <button 
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleAddMedicine}
                  style={{ width: '100%', marginTop: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', borderStyle: 'dashed' }}
                >
                  <Plus size={18} />
                  Agregar Medicamento
                </button>
              </div>

              {/* Listado de medicamentos agregados */}
              <div style={styles.medsListWrapper}>
                <h4 style={styles.medsListTitle}>Medicamentos Prescritos ({medicines.length})</h4>
                {medicines.length === 0 ? (
                  <p style={styles.emptyMedsText}>No has agregado ningún medicamento a la receta.</p>
                ) : (
                  <div style={styles.medsList}>
                    {medicines.map((med, index) => (
                      <div key={index} style={styles.medItem}>
                        <div style={styles.medDetails}>
                          <p style={styles.medNameText}>{med.name} - {med.dose}</p>
                          <p style={styles.medInstructions}>{med.frequency} • {med.duration}</p>
                        </div>
                        <button 
                          type="button" 
                          style={styles.medRemoveBtn}
                          onClick={() => handleRemoveMedicine(index)}
                          title="Eliminar medicamento"
                        >
                          <Trash2 size={15} color="#ef4444" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Indicaciones de la receta */}
              <div className="form-group" style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <label className="form-label">Notas Adicionales de la Receta</label>
                <textarea 
                  className="form-input" 
                  name="prescription_notes" 
                  placeholder="Indicaciones adicionales de toma o advertencias..." 
                  rows={2} 
                />
              </div>

              {/* Botón de Enviar */}
              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={loading} 
                style={{ width: '100%', gap: '0.5rem', marginTop: '1rem' }}
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
          </div>
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
