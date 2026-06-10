'use client'

import React, { useState } from 'react'
import { 
  Activity, 
  ClipboardList, 
  FileSpreadsheet, 
  FileText, 
  Pill, 
  ChevronDown, 
  ChevronUp, 
  Download,
  Baby
} from 'lucide-react'
import PediatricGrowthChart from './PediatricGrowthChart'

interface PatientHistoryTabsProps {
  patient: any
  consultations: any[]
  studies: any[]
  prescriptions: any[]
}

export default function PatientHistoryTabs({
  patient,
  consultations,
  studies,
  prescriptions
}: PatientHistoryTabsProps) {
  const [activeTab, setActiveTab] = useState<'consultations' | 'history' | 'prescriptions' | 'studies' | 'pediatrics'>('consultations')
  const [expandedPrescription, setExpandedPrescription] = useState<string | null>(null)

  return (
    <div style={styles.expedienteContent}>
      {/* Navigation Tabs */}
      <div style={styles.tabsRow}>
        <button 
          type="button"
          style={activeTab === 'consultations' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('consultations')}
        >
          <Activity size={18} />
          <span>Consultas (Evolución)</span>
        </button>
        
        <button 
          type="button"
          style={activeTab === 'history' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('history')}
        >
          <ClipboardList size={18} />
          <span>Antecedentes</span>
        </button>

        <button 
          type="button"
          style={activeTab === 'prescriptions' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('prescriptions')}
        >
          <FileText size={18} />
          <span>Recetas Emitidas</span>
        </button>

        <button 
          type="button"
          style={activeTab === 'studies' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('studies')}
        >
          <FileSpreadsheet size={18} />
          <span>Estudios Médicos</span>
        </button>

        {patient.is_pediatric && (
          <button 
            type="button"
            style={activeTab === 'pediatrics' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('pediatrics')}
          >
            <Baby size={18} />
            <span>Pediatría</span>
          </button>
        )}
      </div>

      {/* Tab Contents */}
      <div style={styles.tabContentContainer}>
        {/* TAB 1: CONSULTAS */}
        {activeTab === 'consultations' && (
          <div style={styles.tabView}>
            <div style={styles.tabHeader}>
              <h3 style={styles.tabTitle}>Historial de Consultas de Evolución</h3>
              <span className="badge badge-info">{consultations.length} Consultas</span>
            </div>

            {consultations.length === 0 ? (
              <div style={styles.tabEmptyState}>
                <Activity size={40} color="var(--text-muted)" style={{ opacity: 0.5, marginBottom: '1rem' }} />
                <p>Este paciente aún no tiene ninguna consulta clínica registrada.</p>
              </div>
            ) : (
              <div style={styles.timeline}>
                {consultations.map((consult) => {
                  const date = new Date(consult.created_at).toLocaleDateString('es-HN', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })
                  const docName = consult.user_profiles ? `Dr. ${consult.user_profiles.first_name} ${consult.user_profiles.last_name}` : 'Médico'
                  
                  return (
                    <div key={consult.id} style={styles.timelineItem}>
                      <div style={styles.timelineBadge}></div>
                      <div className="card" style={styles.timelineCard}>
                        <div style={styles.timelineCardHeader}>
                          <div>
                            <p style={styles.consultDate}>{date}</p>
                            <p style={styles.consultDoctor}>{docName}</p>
                          </div>
                          
                          <div style={styles.vitalsRow}>
                            {consult.blood_pressure && <span style={styles.vitalTag}>PA: {consult.blood_pressure}</span>}
                            {consult.temperature && <span style={styles.vitalTag}>T°: {consult.temperature}°C</span>}
                            {consult.weight && <span style={styles.vitalTag}>Peso: {consult.weight}kg</span>}
                            {consult.heart_rate && <span style={styles.vitalTag}>FC: {consult.heart_rate}bpm</span>}
                          </div>
                        </div>

                        <div style={styles.consultField}>
                          <p style={styles.fieldLabel}>Motivo de Consulta:</p>
                          <p style={styles.fieldText}>{consult.reason_for_visit}</p>
                        </div>

                        {consult.symptoms && (
                          <div style={styles.consultField}>
                            <p style={styles.fieldLabel}>Síntomas:</p>
                            <p style={styles.fieldText}>{consult.symptoms}</p>
                          </div>
                        )}

                        <div style={{ ...styles.consultField, borderLeft: '3px solid var(--primary)', paddingLeft: '0.75rem' }}>
                          <p style={styles.fieldLabel}>Diagnóstico:</p>
                          <p style={{ ...styles.fieldText, fontWeight: '700' }}>{consult.diagnosis}</p>
                        </div>

                        <div style={styles.consultField}>
                          <p style={styles.fieldLabel}>Plan de Tratamiento:</p>
                          <p style={styles.fieldText}>{consult.treatment_plan}</p>
                        </div>

                        {/* Medicamentos recetados */}
                        {consult.prescriptions && consult.prescriptions.length > 0 && (
                          <div style={{
                            marginTop: '0.75rem',
                            padding: '1rem',
                            backgroundColor: 'rgba(13, 148, 136, 0.06)',
                            borderRadius: '8px',
                            border: '1px solid rgba(13, 148, 136, 0.15)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                              <Pill size={16} color="var(--primary)" />
                              <p style={{ ...styles.fieldLabel, marginBottom: 0, color: 'var(--primary)' }}>Receta Médica ({consult.prescriptions[0].verification_code})</p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              {(consult.prescriptions[0].medicines || []).map((med: any, idx: number) => (
                                <div key={idx} style={{
                                  display: 'flex',
                                  gap: '0.75rem',
                                  padding: '0.4rem 0.6rem',
                                  backgroundColor: 'var(--bg-card)',
                                  borderRadius: '6px',
                                  fontSize: '0.8rem',
                                  alignItems: 'center',
                                  border: '1px solid var(--border-color)',
                                }}>
                                  <span style={{ fontWeight: '700', color: 'var(--text-main)', minWidth: '20px' }}>{idx + 1}.</span>
                                  <span style={{ fontWeight: '600', color: 'var(--text-main)', flex: 1 }}>{med.name}</span>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{med.dose || ''}</span>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{med.frequency || ''}</span>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{med.duration || ''}</span>
                                </div>
                              ))}
                            </div>
                            {consult.prescriptions[0].notes && (
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                                📝 {consult.prescriptions[0].notes}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ANTECEDENTES */}
        {activeTab === 'history' && (
          <div style={styles.tabView}>
            <h3 style={styles.tabTitle}>Antecedentes Clínicos del Paciente</h3>
            <div style={styles.formGrid} className="grid-2">
              <div className="card" style={styles.historyBlock}>
                <h4 style={styles.historyBlockTitle}>Patológicos (Enfermedades y Cirugías)</h4>
                <p style={styles.historyBlockText}>{patient.pathological_history || 'No declarados'}</p>
              </div>

              <div className="card" style={styles.historyBlock}>
                <h4 style={styles.historyBlockTitle}>No Patológicos (Hábitos y Vacunas)</h4>
                <p style={styles.historyBlockText}>{patient.non_pathological_history || 'No declarados'}</p>
              </div>
            </div>

            <div className="card" style={{ ...styles.historyBlock, marginTop: '1.5rem' }}>
              <h4 style={styles.historyBlockTitle}>Antecedentes Heredofamiliares</h4>
              <p style={styles.historyBlockText}>{patient.family_history || 'No declarados'}</p>
            </div>
          </div>
        )}

        {/* TAB 3: RECETAS */}
        {activeTab === 'prescriptions' && (
          <div style={styles.tabView}>
            <div style={styles.tabHeader}>
              <h3 style={styles.tabTitle}>Historial de Recetas Generadas</h3>
              <span className="badge badge-info">{prescriptions.length} Recetas</span>
            </div>

            {prescriptions.length === 0 ? (
              <div style={styles.tabEmptyState}>
                <FileText size={40} color="var(--text-muted)" style={{ opacity: 0.5, marginBottom: '1rem' }} />
                <p>No se han emitido recetas médicas para este paciente aún.</p>
              </div>
            ) : (
              <div style={styles.studiesList}>
                {prescriptions.map((presc) => {
                  const date = new Date(presc.created_at).toLocaleDateString('es-HN')
                  const docName = presc.user_profiles ? `Dr. ${presc.user_profiles.first_name} ${presc.user_profiles.last_name}` : 'Médico'
                  const isExpanded = expandedPrescription === presc.id
                  
                  return (
                    <div key={presc.id} className="card" style={{ ...styles.studyRow, flexDirection: 'column', alignItems: 'stretch' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                        <div 
                          style={{ ...styles.studyInfo, cursor: 'pointer', flex: 1 }} 
                          onClick={() => setExpandedPrescription(isExpanded ? null : presc.id)}
                        >
                          <FileText size={22} color="var(--primary)" />
                          <div style={{ flex: 1 }}>
                            <p style={styles.studyNameText}>Receta Médica - Código: {presc.verification_code}</p>
                            <p style={styles.studyMeta}>Emitida el {date} por {docName}</p>
                          </div>
                          {isExpanded ? <ChevronUp size={18} color="var(--text-muted)" /> : <ChevronDown size={18} color="var(--text-muted)" />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={{
                          marginTop: '1rem',
                          padding: '1rem',
                          backgroundColor: 'rgba(13, 148, 136, 0.04)',
                          borderRadius: '8px',
                          border: '1px solid rgba(13, 148, 136, 0.12)',
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: '2fr 1fr 1fr 1fr',
                              gap: '0.5rem',
                              padding: '0.4rem 0.6rem',
                              fontSize: '0.7rem',
                              fontWeight: '700',
                              color: 'var(--text-muted)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}>
                              <span>Medicamento</span>
                              <span>Dosis</span>
                              <span>Frecuencia</span>
                              <span>Duración</span>
                            </div>
                            {(presc.medicines || []).map((med: any, idx: number) => (
                              <div key={idx} style={{
                                display: 'grid',
                                gridTemplateColumns: '2fr 1fr 1fr 1fr',
                                gap: '0.5rem',
                                padding: '0.5rem 0.6rem',
                                backgroundColor: 'var(--bg-card)',
                                borderRadius: '6px',
                                fontSize: '0.82rem',
                                border: '1px solid var(--border-color)',
                              }}>
                                <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{idx + 1}. {med.name}</span>
                                <span style={{ color: 'var(--text-muted)' }}>{med.dose || '—'}</span>
                                <span style={{ color: 'var(--text-muted)' }}>{med.frequency || '—'}</span>
                                <span style={{ color: 'var(--text-muted)' }}>{med.duration || '—'}</span>
                              </div>
                            ))}
                          </div>

                          {presc.notes && (
                            <div style={{
                              marginTop: '0.75rem',
                              padding: '0.6rem 0.8rem',
                              backgroundColor: '#fffbeb',
                              border: '1px solid #fde68a',
                              borderRadius: '6px',
                              borderLeft: '3px solid #f59e0b',
                            }}>
                              <p style={{ fontSize: '0.75rem', fontWeight: '700', color: '#92400e', margin: '0 0 0.25rem', textTransform: 'uppercase' }}>📝 Indicaciones</p>
                              <p style={{ fontSize: '0.82rem', color: '#78350f', margin: 0, whiteSpace: 'pre-line' }}>{presc.notes}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ESTUDIOS */}
        {activeTab === 'studies' && (
          <div style={styles.tabView}>
            <h3 style={styles.tabTitle}>Estudios Médicos y Archivos</h3>

            {studies.length === 0 ? (
              <div style={styles.tabEmptyState}>
                <FileSpreadsheet size={40} color="var(--text-muted)" style={{ opacity: 0.5, marginBottom: '1rem' }} />
                <p>No hay radiografías, ultrasonidos o resultados de laboratorio subidos para este paciente.</p>
              </div>
            ) : (
              <div style={styles.studiesList}>
                {studies.map((study) => {
                  const date = new Date(study.created_at).toLocaleDateString('es-HN')
                  return (
                    <div key={study.id} className="card" style={styles.studyRow}>
                      <div style={styles.studyInfo}>
                        <FileSpreadsheet size={22} color="var(--secondary)" />
                        <div>
                          <p style={styles.studyNameText}>{study.name}</p>
                          <p style={styles.studyMeta}>Subido el {date}</p>
                        </div>
                      </div>
                      <div style={styles.studyActions}>
                        <a 
                          href={study.signedUrl} 
                          target="_blank" 
                          className="btn btn-secondary" 
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', gap: '0.25rem' }}
                        >
                          <Download size={14} />
                          Ver / Descargar
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: PEDIATRÍA */}
        {activeTab === 'pediatrics' && patient.is_pediatric && (
          <div style={styles.tabView}>
            <div style={styles.tabHeader}>
              <h3 style={styles.tabTitle}>Expediente Pediátrico</h3>
            </div>
            
            <PediatricGrowthChart consultations={consultations} patient={patient} />
            
            <div style={styles.formGrid} className="grid-2">
              <div className="card" style={styles.historyBlock}>
                <h4 style={styles.historyBlockTitle}>Esquema de Vacunación (Notas)</h4>
                <textarea 
                  className="form-input" 
                  disabled 
                  value="Historial de vacunas. (Funcionalidad de guardado pendiente)." 
                  rows={4} 
                  style={{ opacity: 0.7 }}
                />
              </div>

              <div className="card" style={styles.historyBlock}>
                <h4 style={styles.historyBlockTitle}>Antecedentes Prenatales</h4>
                <textarea 
                  className="form-input" 
                  disabled 
                  value="Complicaciones en embarazo, semanas de gestación, etc. (Funcionalidad de guardado pendiente)." 
                  rows={4} 
                  style={{ opacity: 0.7 }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  expedienteContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  tabsRow: {
    display: 'flex',
    gap: '0.5rem',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '1px',
    overflowX: 'auto',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.85rem 1.25rem',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    transition: 'all var(--transition-fast)',
  },
  tabActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.85rem 1.25rem',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--primary)',
    fontSize: '0.875rem',
    fontWeight: '700',
    cursor: 'pointer',
    borderBottom: '2px solid var(--primary)',
  },
  tabContentContainer: {
    marginTop: '0.5rem',
  },
  tabView: {
    display: 'flex',
    flexDirection: 'column',
  },
  tabHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.25rem',
  },
  tabTitle: {
    fontSize: '1.1rem',
    fontWeight: '700',
    marginBottom: '1.25rem',
  },
  tabEmptyState: {
    padding: '4rem 2rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    paddingLeft: '1rem',
    borderLeft: '2px solid var(--border-color)',
    marginLeft: '1rem',
  },
  timelineItem: {
    position: 'relative',
  },
  timelineBadge: {
    position: 'absolute',
    left: '-1.45rem',
    top: '1.5rem',
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    backgroundColor: 'var(--primary)',
    border: '3px solid var(--bg-main)',
  },
  timelineCard: {
    padding: '1.5rem',
  },
  timelineCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem',
    paddingBottom: '1rem',
    borderBottom: '1px solid var(--border-color)',
  },
  consultDate: {
    fontSize: '1.1rem',
    fontWeight: '800',
    color: 'var(--text-main)',
    textTransform: 'capitalize',
  },
  consultDoctor: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
    marginTop: '0.25rem',
    fontWeight: '600',
  },
  vitalsRow: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: '50%',
  },
  vitalTag: {
    backgroundColor: 'rgba(13, 148, 136, 0.1)',
    color: 'var(--primary-dark)',
    padding: '0.3rem 0.6rem',
    borderRadius: '6px',
    fontSize: '0.75rem',
    fontWeight: '700',
    whiteSpace: 'nowrap',
  },
  consultField: {
    marginBottom: '1rem',
  },
  fieldLabel: {
    fontSize: '0.8rem',
    fontWeight: '700',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.25rem',
  },
  fieldText: {
    fontSize: '0.95rem',
    lineHeight: '1.5',
    color: 'var(--text-main)',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '1rem',
  },
  historyBlock: {
    padding: '1.25rem',
  },
  historyBlockTitle: {
    fontSize: '0.9rem',
    fontWeight: '700',
    color: 'var(--text-main)',
    marginBottom: '0.5rem',
  },
  historyBlockText: {
    fontSize: '0.9rem',
    color: 'var(--text-muted)',
    lineHeight: '1.5',
  },
  studiesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  studyRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 1.25rem',
  },
  studyInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  studyNameText: {
    fontWeight: '700',
    fontSize: '0.95rem',
    color: 'var(--text-main)',
  },
  studyMeta: {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    marginTop: '0.2rem',
  },
  studyActions: {
    display: 'flex',
    gap: '0.5rem',
  }
}
