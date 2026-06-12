'use client'

import React, { useState, useEffect } from 'react'
import { 
  Activity,
  Beaker,
  ClipboardList,
  FileSpreadsheet,
  FileText, 
  Pill, 
  ChevronDown, 
  ChevronUp, 
  Download,
  Baby,
  Printer,

  Copy,
  Check,
  Globe,
  Lock,
  Zap,
  X
} from 'lucide-react'
import PediatricGrowthChart from './PediatricGrowthChart'
import StudyUploader from './StudyUploader'
import StudyList from './StudyList'

interface PatientHistoryTabsProps {
  patient: any
  consultations: any[]
  studies: any[]
  prescriptions: any[]
  currentUserId: string
  currentUserRole: string
  isOrgAdmin: boolean
}

export default function PatientHistoryTabs({
  patient,
  consultations,
  studies,
  prescriptions,
  currentUserId,
  currentUserRole,
  isOrgAdmin
}: PatientHistoryTabsProps) {
  const [appUrl, setAppUrl] = useState('')
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppUrl(window.location.origin)
    }
  }, [])
  const [activeTab, setActiveTab] = useState<'consultations' | 'history' | 'prescriptions' | 'studies' | 'pediatrics'>('consultations')
  const [expandedPrescription, setExpandedPrescription] = useState<string | null>(null)
  const [copiedPrescId, setCopiedPrescId] = useState<string | null>(null)
  const [whatsappModalPresc, setWhatsappModalPresc] = useState<any | null>(null)
  const [expandedConsultations, setExpandedConsultations] = useState<Record<string, boolean>>({})
  const toggleConsultation = (id: string) => {
    setExpandedConsultations(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const handleCopyPrescription = (presc: any) => {
    const docName = presc.user_profiles ? `Dr. ${presc.user_profiles.first_name} ${presc.user_profiles.last_name}` : 'Médico'
    const text = `Hola ${patient.first_name}, el ${docName} te ha compartido la siguiente receta médica:\n${appUrl}/prescriptions/view/${presc.id}\n\nCódigo de acceso: ${presc.verification_code}`
    navigator.clipboard.writeText(text)
    
    setCopiedPrescId(presc.id)
    setTimeout(() => {
      setCopiedPrescId(null)
    }, 2000)
  }

  const handleWhatsAppPrescriptionShare = (e: React.MouseEvent<HTMLAnchorElement>, presc: any) => {
    e.preventDefault()
    setWhatsappModalPresc(presc)
  }

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
                    const isExpanded = !!expandedConsultations[consult.id]
                    
                    return (
                      <div key={consult.id} style={styles.timelineItem}>
                        <div style={styles.timelineBadge}></div>
                        <div 
                          className="card" 
                          style={{
                            ...styles.timelineCard,
                            cursor: 'pointer',
                            padding: isExpanded ? '1.5rem' : '1rem 1.5rem',
                            transition: 'all 0.2s ease-in-out'
                          }}
                          onClick={() => toggleConsultation(consult.id)}
                        >
                          <div style={{
                            ...styles.timelineCardHeader,
                            borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none',
                            paddingBottom: isExpanded ? '0.75rem' : '0',
                            marginBottom: isExpanded ? '1rem' : '0',
                            alignItems: 'center'
                          }}>
                            <div>
                              <p style={styles.consultDate}>{date}</p>
                              <p style={styles.consultDoctor}>{docName}</p>
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                              {/* Signos Vitales Badge */}
                              <div style={styles.vitalsRow}>
                                {consult.blood_pressure && <span style={styles.vitalTag}>PA: {consult.blood_pressure}</span>}
                                {consult.temperature && <span style={styles.vitalTag}>T°: {consult.temperature}°C</span>}
                                {consult.weight && <span style={styles.vitalTag}>Peso: {consult.weight}kg</span>}
                                {consult.heart_rate && <span style={styles.vitalTag}>FC: {consult.heart_rate}bpm</span>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
                                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                              </div>
                            </div>
                          </div>

                          {isExpanded && (
                            <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              {/* Diagnóstico Principal (Ancho Completo) */}
                              <div style={{
                                backgroundColor: 'rgba(13, 148, 136, 0.04)',
                                border: '1px solid rgba(13, 148, 136, 0.2)',
                                borderLeft: '4px solid var(--primary)',
                                borderRadius: '8px',
                                padding: '12px 16px',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: 'var(--primary)' }}>
                                  <Activity size={14} color="var(--primary)" />
                                  <span style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Diagnóstico Principal</span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.95rem', color: '#0f172a', lineHeight: '1.5', fontWeight: '700' }}>{consult.diagnosis}</p>
                              </div>

                              {/* Grid de Motivo y Síntomas */}
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                gap: '1rem'
                              }}>
                                <div style={{
                                  backgroundColor: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '8px',
                                  padding: '12px 16px',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: '#64748b' }}>
                                    <ClipboardList size={14} />
                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Motivo de Consulta</span>
                                  </div>
                                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a', lineHeight: '1.5', fontWeight: '500' }}>{consult.reason_for_visit}</p>
                                </div>

                                <div style={{
                                  backgroundColor: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '8px',
                                  padding: '12px 16px',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: '#64748b' }}>
                                    <Activity size={14} color="#3b82f6" />
                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Síntomas</span>
                                  </div>
                                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a', lineHeight: '1.5', fontWeight: '500' }}>{consult.symptoms || 'Ninguno reportado'}</p>
                                </div>
                              </div>

                              {/* Grid de Estudios y Plan de Tratamiento */}
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                gap: '1rem'
                              }}>
                                <div style={{
                                  backgroundColor: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '8px',
                                  padding: '12px 16px',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: '#64748b' }}>
                                    <Beaker size={14} />
                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Exámenes de laboratorio/ estudios médicos</span>
                                  </div>
                                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a', lineHeight: '1.5', fontWeight: '500', whiteSpace: 'pre-line' }}>{consult.physical_exam || 'Ninguno registrado'}</p>
                                </div>

                                <div style={{
                                  backgroundColor: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '8px',
                                  padding: '12px 16px',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: '#64748b' }}>
                                    <FileText size={14} />
                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plan de Tratamiento</span>
                                  </div>
                                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a', lineHeight: '1.5', fontWeight: '500', whiteSpace: 'pre-line' }}>{consult.treatment_plan}</p>
                                </div>
                              </div>

                              {/* Medicamentos recetados */}
                              {consult.prescriptions && consult.prescriptions.length > 0 && (
                                <div style={{
                                  marginTop: '0.5rem',
                                  padding: '1.25rem',
                                  backgroundColor: 'rgba(13, 148, 136, 0.04)',
                                  borderRadius: '8px',
                                  border: '1px solid rgba(13, 148, 136, 0.12)',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                    <Pill size={16} color="var(--primary)" />
                                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tratamiento Farmacológico ({consult.prescriptions[0].verification_code})</span>
                                  </div>
                                  
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxWidth: '720px' }}>
                                    {/* Cabecera de la tabla de medicamentos */}
                                    <div style={{
                                      display: 'flex',
                                      gap: '0.75rem',
                                      padding: '0.5rem 0.6rem',
                                      backgroundColor: 'rgba(148, 163, 184, 0.08)',
                                      borderRadius: '6px',
                                      fontSize: '0.72rem',
                                      fontWeight: '700',
                                      color: '#475569',
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.05em',
                                      border: '1px solid #e2e8f0',
                                    }}>
                                      <span style={{ width: '24px', flexShrink: 0 }}>#</span>
                                      <span style={{ flex: 2.5 }}>Medicamento</span>
                                      <span style={{ flex: 1 }}>Dosis</span>
                                      <span style={{ flex: 1.2 }}>Frecuencia</span>
                                      <span style={{ flex: 1.2 }}>Duración</span>
                                    </div>

                                    {(consult.prescriptions[0].medicines || []).map((med: any, idx: number) => (
                                      <div key={idx} style={{
                                        display: 'flex',
                                        gap: '0.75rem',
                                        padding: '0.5rem 0.6rem',
                                        backgroundColor: 'var(--bg-card)',
                                        borderRadius: '6px',
                                        fontSize: '0.82rem',
                                        alignItems: 'center',
                                        border: '1px solid var(--border-color)',
                                      }}>
                                        <span style={{ fontWeight: '700', color: 'var(--text-main)', width: '24px', flexShrink: 0 }}>{idx + 1}</span>
                                        <span style={{ fontWeight: '700', color: 'var(--text-main)', flex: 2.5 }}>{med.name}</span>
                                        <span style={{ color: 'var(--text-muted)', flex: 1 }}>{med.dose || 'N/A'}</span>
                                        <span style={{ color: 'var(--text-muted)', flex: 1.2 }}>{med.frequency || 'N/A'}</span>
                                        <span style={{ color: 'var(--text-muted)', flex: 1.2 }}>{med.duration || 'N/A'}</span>
                                      </div>
                                    ))}
                                  </div>
                                  {consult.prescriptions[0].notes && (
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.75rem', fontStyle: 'italic', paddingLeft: '4px' }}>
                                      📝 Notas: {consult.prescriptions[0].notes}
                                    </p>
                                  )}
                                </div>
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
                  const patientPhoneClean = patient.phone ? patient.phone.replace(/\D/g, '') : ''
                  
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
                        <div style={styles.studyActions}>
                          <a 
                            href={`/prescriptions/${presc.id}/print`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary" 
                            style={{ padding: '0.4rem 0.6rem', backgroundColor: '#e2e8f0', color: '#475569', border: 'none' }}
                            title="Imprimir Receta"
                          >
                            <Printer size={14} />
                          </a>
                          <a 
                            href="#"
                            onClick={(e) => handleWhatsAppPrescriptionShare(e, presc)}
                            className="btn" 
                            style={{ 
                              padding: '0.4rem 0.6rem', 
                              backgroundColor: '#dcf8c6', 
                              color: '#128C7E', 
                              border: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title="Enviar por WhatsApp"
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ display: 'block' }}>
                              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.003 5.324 5.328 0 11.896 0c3.181.001 6.173 1.24 8.424 3.493 2.25 2.253 3.487 5.244 3.484 8.427-.004 6.578-5.329 11.902-11.897 11.902-2.003-.001-3.973-.505-5.727-1.467L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.725 1.45 5.247 0 9.518-4.268 9.52-9.51 0-2.54-1-4.927-2.817-6.724-1.815-1.8-4.223-2.79-6.733-2.792-5.253 0-9.526 4.268-9.529 9.511 0 1.63.43 3.22 1.25 4.63l-.993 3.626 3.725-.976zm11.233-6.006c-.3-.15-1.772-.875-2.047-.975-.276-.1-.477-.15-.677.15-.2.3-.777.975-.952 1.175-.176.2-.351.225-.651.075-1.204-.6-2.002-1.054-2.8-2.427-.21-.362.21-.337.6-.113.35.2.775.9.875 1.1.1.2.05.375-.025.525-.075.15-.677.8-1.002 1.175-.325.375-.65.3-.95.15-1.157-.58-1.907-1.01-2.67-2.327-.15-.257-.15-.425.075-.65.2-.2.45-.525.677-.8.225-.275.3-.475.45-.775.15-.3.075-.575-.025-.775-.1-.2-.677-1.625-.927-2.225-.244-.588-.492-.51-.677-.52l-.576-.007c-.2 0-.527.075-.803.375-.276.3-1.053 1.025-1.053 2.5 0 1.475 1.078 2.9 1.228 3.1.15.2 2.122 3.24 5.141 4.542.717.31 1.277.494 1.714.633.72.228 1.376.196 1.894.118.577-.087 1.772-.725 2.022-1.425.25-.7.25-1.3 1.75-1.425-.075-.125-.275-.2-.575-.35z" />
                            </svg>
                          </a>
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

            <StudyUploader patientId={patient.id} />

            <StudyList
              studies={studies}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              isOrgAdmin={isOrgAdmin}
            />
          </div>
        )}

        {/* TAB 5: PEDIATRÍA */}
        {activeTab === 'pediatrics' && patient.is_pediatric && (
          <div style={styles.tabView}>
            <div style={styles.tabHeader}>
              <h3 style={styles.tabTitle}>Expediente Pediátrico</h3>
            </div>
            
            <PediatricGrowthChart consultations={consultations} patient={patient} />
          </div>
        )}
      </div>

      {whatsappModalPresc && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem',
          boxSizing: 'border-box'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '440px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            border: '1px solid #e2e8f0',
            padding: '24px',
            position: 'relative',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="#25D366" style={{ display: 'block', flexShrink: 0 }}>
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.003 5.324 5.328 0 11.896 0c3.181.001 6.173 1.24 8.424 3.493 2.25 2.253 3.487 5.244 3.484 8.427-.004 6.578-5.329 11.902-11.897 11.902-2.003-.001-3.973-.505-5.727-1.467L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.725 1.45 5.247 0 9.518-4.268 9.52-9.51 0-2.54-1-4.927-2.817-6.724-1.815-1.8-4.223-2.79-6.733-2.792-5.253 0-9.526 4.268-9.529 9.511 0 1.63.43 3.22 1.25 4.63l-.993 3.626 3.725-.976zm11.233-6.006c-.3-.15-1.772-.875-2.047-.975-.276-.1-.477-.15-.677.15-.2.3-.777.975-.952 1.175-.176.2-.351.225-.651.075-1.204-.6-2.002-1.054-2.8-2.427-.21-.362.21-.337.6-.113.35.2.775.9.875 1.1.1.2.05.375-.025.525-.075.15-.677.8-1.002 1.175-.325.375-.65.3-.95.15-1.157-.58-1.907-1.01-2.67-2.327-.15-.257-.15-.425.075-.65.2-.2.45-.525.677-.8.225-.275.3-.475.45-.775.15-.3.075-.575-.025-.775-.1-.2-.677-1.625-.927-2.225-.244-.588-.492-.51-.677-.52l-.576-.007c-.2 0-.527.075-.803.375-.276.3-1.053 1.025-1.053 2.5 0 1.475 1.078 2.9 1.228 3.1.15.2 2.122 3.24 5.141 4.542.717.31 1.277.494 1.714.633.72.228 1.376.196 1.894.118.577-.087 1.772-.725 2.022-1.425.25-.7.25-1.3 1.75-1.425-.075-.125-.275-.2-.575-.35z" />
                </svg>
                Enviar por WhatsApp
              </h3>
              <button 
                onClick={() => setWhatsappModalPresc(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: '0 0 20px 0', fontSize: '0.9rem', color: '#475569', lineHeight: '1.5' }}>
              Seleccione el nivel de seguridad para compartir la receta médica con el paciente:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Opción 1: Enlace Seguro */}
              <button
                onClick={() => {
                  const presc = whatsappModalPresc
                  const docName = presc.user_profiles ? `Dr. ${presc.user_profiles.first_name} ${presc.user_profiles.last_name}` : 'Médico'
                  const text = `Hola ${patient.first_name}, el ${docName} te ha compartido la siguiente receta médica:\n${appUrl}/prescriptions/view/${presc.id}\n\nCódigo de acceso: ${presc.verification_code}`
                  const patientPhoneClean = patient.phone ? patient.phone.replace(/\D/g, '') : ''
                  const whatsappUrl = `https://api.whatsapp.com/send?phone=${patientPhoneClean}&text=${encodeURIComponent(text)}`
                  window.open(whatsappUrl, '_blank', 'noreferrer')
                  setWhatsappModalPresc(null)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '14px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  width: '100%'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#f1f5f9'
                  e.currentTarget.style.borderColor = '#cbd5e1'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#f8fafc'
                  e.currentTarget.style.borderColor = '#e2e8f0'
                }}
              >
                <div style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Lock size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '0.92rem', color: '#0f172a', marginBottom: '2px' }}>🔒 Enlace Seguro (Pedir Código)</strong>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: '1.4' }}>El paciente deberá digitar el código de seguridad manualmente para poder ver la receta.</span>
                </div>
              </button>

              {/* Opción 2: Enlace Directo */}
              <button
                onClick={() => {
                  const presc = whatsappModalPresc
                  const docName = presc.user_profiles ? `Dr. ${presc.user_profiles.first_name} ${presc.user_profiles.last_name}` : 'Médico'
                  const text = `Hola ${patient.first_name}, el ${docName} te ha compartido la siguiente receta médica:\n${appUrl}/prescriptions/view/${presc.id}?code=${presc.verification_code}`
                  const patientPhoneClean = patient.phone ? patient.phone.replace(/\D/g, '') : ''
                  const whatsappUrl = `https://api.whatsapp.com/send?phone=${patientPhoneClean}&text=${encodeURIComponent(text)}`
                  window.open(whatsappUrl, '_blank', 'noreferrer')
                  setWhatsappModalPresc(null)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '10px',
                  padding: '14px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  width: '100%'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#dcfce7'
                  e.currentTarget.style.borderColor = '#86efac'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#f0fdf4'
                  e.currentTarget.style.borderColor = '#bbf7d0'
                }}
              >
                <div style={{ backgroundColor: '#dcfce7', color: '#22c55e', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '0.92rem', color: '#166534', marginBottom: '2px' }}>⚡ Enlace Directo (Un Clic)</strong>
                  <span style={{ fontSize: '0.8rem', color: '#15803d', lineHeight: '1.4' }}>La receta se abre automáticamente al hacer clic en el enlace, sin solicitar código de seguridad.</span>
                </div>
              </button>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setWhatsappModalPresc(null)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  color: '#475569',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
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
