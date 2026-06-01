'use client'

import React, { useState, useTransition } from 'react'
import { updatePatient, uploadMedicalStudy } from '../actions'
import { 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar, 
  Activity, 
  AlertCircle,
  FileText,
  Loader2,
  Edit,
  Upload,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  Download,
  Plus
} from 'lucide-react'

// Utilidad para calcular edad
function calculateAge(birthDateString: string) {
  const today = new Date()
  const birthDate = new Date(birthDateString)
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return age
}

interface PatientDetailsClientProps {
  patient: any
  consultations: any[]
  studies: any[]
  prescriptions: any[]
}

export default function PatientDetailsClient({
  patient,
  consultations,
  studies,
  prescriptions
}: PatientDetailsClientProps) {
  const [activeTab, setActiveTab] = useState<'history' | 'consultations' | 'prescriptions' | 'studies'>('consultations')
  const [isEditing, setIsEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editPending, startEditTransition] = useTransition()

  // Estados para subir estudios
  const [studyFile, setStudyFile] = useState<File | null>(null)
  const [studyName, setStudyName] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadLoading, setUploadLoading] = useState(false)

  // Manejar edición de ficha
  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEditError(null)
    const formData = new FormData(event.currentTarget)
    
    startEditTransition(async () => {
      const result = await updatePatient(patient.id, formData)
      if (result.error) {
        setEditError(result.error)
      } else {
        setIsEditing(false)
      }
    })
  }

  // Manejar carga de archivos
  async function handleUploadStudy(event: React.FormEvent) {
    event.preventDefault()
    if (!studyFile || !studyName.trim()) {
      setUploadError('Por favor completa el nombre del estudio y selecciona un archivo.')
      return
    }
    
    setUploadError(null)
    setUploadLoading(true)

    const result = await uploadMedicalStudy(patient.id, studyName, studyFile)
    
    setUploadLoading(false)
    if (result.error) {
      setUploadError(result.error)
    } else {
      setStudyFile(null)
      setStudyName('')
      alert('Estudio médico subido exitosamente.')
    }
  }

  return (
    <div style={styles.container} className="animate-fade-in">
      {/* Patient Profile Header Card */}
      <div className="card-glass" style={styles.headerCard}>
        <div style={styles.headerLayout}>
          <div style={styles.avatar}>
            {patient.first_name.charAt(0)}{patient.last_name.charAt(0)}
          </div>

          <div style={styles.profileDetails}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <h2 style={styles.patientName}>{patient.first_name} {patient.last_name}</h2>
              {patient.blood_type && (
                <span className="badge badge-danger" style={{ fontWeight: '800' }}>
                  Grupo: {patient.blood_type}
                </span>
              )}
            </div>
            
            <p style={styles.demographicsSub}>
              {calculateAge(patient.birth_date)} años • Nacido el {new Date(patient.birth_date).toLocaleDateString('es-HN')} • 
              Género: {patient.gender === 'M' ? 'Masculino' : patient.gender === 'F' ? 'Femenino' : 'Otro'}
            </p>

            <div style={styles.contactRow}>
              <span style={styles.contactItem}>
                <Phone size={14} />
                <span>{patient.phone}</span>
              </span>
              {patient.email ? (
                <span style={styles.contactItem}>
                  <Mail size={14} />
                  <span>{patient.email}</span>
                </span>
              ) : null}
              {patient.id_card ? (
                <span style={styles.contactItem}>
                  <span>DNI: {patient.id_card}</span>
                </span>
              ) : null}
            </div>
          </div>

          <div style={styles.headerActions}>
            <button className="btn btn-secondary" style={{ gap: '0.4rem' }} onClick={() => setIsEditing(!isEditing)}>
              <Edit size={16} />
              {isEditing ? 'Cancelar Edición' : 'Editar Ficha'}
            </button>
            <a 
              href={`/dashboard/consultations/new?patientId=${patient.id}`} 
              className="btn btn-primary" 
              style={{ gap: '0.4rem' }}
            >
              <Plus size={16} />
              Nueva Consulta
            </a>
          </div>
        </div>

        {/* Critical Allergies Ribbon */}
        <div style={styles.allergiesRibbon}>
          <AlertCircle size={16} color="#ef4444" />
          <span style={styles.allergiesLabel}>Alergias:</span>
          <span style={styles.allergiesValue}>{patient.allergies || 'Ninguna conocida'}</span>
        </div>
      </div>

      {/* Edit Mode Panel */}
      {isEditing && (
        <div className="card" style={styles.editCard}>
          <h3 style={styles.sectionTitle}>Editar Información del Paciente</h3>
          {editError && <div className="badge badge-danger" style={{ margin: '1rem 0', width: '100%', padding: '0.5rem' }}>{editError}</div>}
          <form onSubmit={handleEditSubmit}>
            <div style={styles.formGrid}>
              <div className="form-group">
                <label className="form-label">Nombre(s) *</label>
                <input className="form-input" name="first_name" defaultValue={patient.first_name} required />
              </div>
              <div className="form-group">
                <label className="form-label">Apellido(s) *</label>
                <input className="form-input" name="last_name" defaultValue={patient.last_name} required />
              </div>
              <div className="form-group">
                <label className="form-label">Identidad (DNI)</label>
                <input className="form-input" name="id_card" defaultValue={patient.id_card} />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha de Nacimiento *</label>
                <input className="form-input" type="date" name="birth_date" defaultValue={patient.birth_date} required />
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp (Honduras) *</label>
                <input className="form-input" name="phone" defaultValue={patient.phone.replace('+504', '')} placeholder="9988-7766" required />
              </div>
              <div className="form-group">
                <label className="form-label">Correo Electrónico</label>
                <input className="form-input" type="email" name="email" defaultValue={patient.email} />
              </div>
              <div className="form-group">
                <label className="form-label">Género</label>
                <select className="form-input" name="gender" defaultValue={patient.gender || ''}>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                  <option value="O">Otro</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de Sangre</label>
                <select className="form-input" name="blood_type" defaultValue={patient.blood_type || ''}>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ color: '#ef4444' }}>Alergias</label>
              <textarea className="form-input" name="allergies" defaultValue={patient.allergies} rows={2} style={{ borderLeft: '3px solid #ef4444' }} />
            </div>

            <div style={styles.formGrid}>
              <div className="form-group">
                <label className="form-label">Antecedentes Patológicos</label>
                <textarea className="form-input" name="pathological_history" defaultValue={patient.pathological_history} rows={3} />
              </div>
              <div className="form-group">
                <label className="form-label">Antecedentes No Patológicos</label>
                <textarea className="form-input" name="non_pathological_history" defaultValue={patient.non_pathological_history} rows={3} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Antecedentes Heredofamiliares</label>
              <textarea className="form-input" name="family_history" defaultValue={patient.family_history} rows={3} />
            </div>

            <div style={styles.editActions}>
              <button type="submit" className="btn btn-primary" disabled={editPending}>
                {editPending ? <Loader2 size={16} className="animate-spin" /> : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Expdediente Section - Tabs */}
      <div style={styles.expedienteContent}>
        {/* Navigation Tabs */}
        <div style={styles.tabsRow}>
          <button 
            style={activeTab === 'consultations' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('consultations')}
          >
            <Activity size={18} />
            <span>Consultas (Evolución)</span>
          </button>
          
          <button 
            style={activeTab === 'history' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('history')}
          >
            <ClipboardList size={18} />
            <span>Antecedentes</span>
          </button>

          <button 
            style={activeTab === 'prescriptions' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('prescriptions')}
          >
            <FileText size={18} />
            <span>Recetas Emitidas</span>
          </button>

          <button 
            style={activeTab === 'studies' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('studies')}
          >
            <FileSpreadsheet size={18} />
            <span>Estudios & Archivos</span>
          </button>
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
                  <a href={`/dashboard/consultations/new?patientId=${patient.id}`} className="btn btn-primary" style={{ marginTop: '1rem', fontSize: '0.8rem' }}>
                    Registrar Primer Consulta
                  </a>
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
                            
                            {/* Signos Vitales Badge */}
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
                    
                    return (
                      <div key={presc.id} className="card" style={styles.studyRow}>
                        <div style={styles.studyInfo}>
                          <FileText size={22} color="var(--primary)" />
                          <div>
                            <p style={styles.studyNameText}>Receta Médica - Código: {presc.verification_code}</p>
                            <p style={styles.studyMeta}>Emitida el {date} por {docName}</p>
                          </div>
                        </div>
                        <div style={styles.studyActions}>
                          {presc.pdf_url && (
                            <a href={presc.pdf_url} target="_blank" className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', gap: '0.25rem' }}>
                              <Download size={14} />
                              Descargar PDF
                            </a>
                          )}
                        </div>
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

              {/* Formulario de subida de archivo */}
              <div className="card" style={styles.uploadStudyCard}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '1rem' }}>Subir Nuevo Estudio</h4>
                {uploadError && <div className="badge badge-danger" style={{ marginBottom: '1rem', padding: '0.5rem', width: '100%' }}>{uploadError}</div>}
                <form onSubmit={handleUploadStudy} style={styles.uploadForm}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <input 
                      className="form-input" 
                      placeholder="Nombre del estudio (Ej. Radiografía Tórax)" 
                      value={studyName}
                      onChange={(e) => setStudyName(e.target.value)}
                      required 
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <input 
                      type="file" 
                      className="form-input" 
                      onChange={(e) => setStudyFile(e.target.files?.[0] || null)}
                      required 
                      accept=".pdf,.png,.jpg,.jpeg"
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ gap: '0.4rem' }} disabled={uploadLoading}>
                    {uploadLoading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    Subir Estudio
                  </button>
                </form>
              </div>

              {/* Lista de archivos */}
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
        </div>
      </div>
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
  headerCard: {
    padding: '2rem',
  },
  headerLayout: {
    display: 'flex',
    alignItems: 'center',
    gap: '2rem',
    flexWrap: 'wrap',
  },
  avatar: {
    width: '72px',
    height: '72px',
    borderRadius: '20px',
    backgroundColor: 'var(--primary-light)',
    color: 'var(--primary)',
    fontSize: '1.5rem',
    fontWeight: '800',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(13, 148, 136, 0.2)',
  },
  profileDetails: {
    flex: 1,
  },
  patientName: {
    fontSize: '1.5rem',
    fontWeight: '800',
  },
  demographicsSub: {
    fontSize: '0.875rem',
    color: 'var(--text-muted)',
    marginTop: '0.25rem',
  },
  contactRow: {
    display: 'flex',
    gap: '1.5rem',
    marginTop: '0.5rem',
    flexWrap: 'wrap',
  },
  contactItem: {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  headerActions: {
    display: 'flex',
    gap: '0.75rem',
  },
  allergiesRibbon: {
    marginTop: '1.5rem',
    paddingTop: '1.25rem',
    borderTop: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
  },
  allergiesLabel: {
    fontWeight: '700',
    color: '#f87171',
  },
  allergiesValue: {
    color: 'var(--text-main)',
    fontWeight: '600',
  },
  editCard: {
    padding: '2rem',
    border: '1px solid var(--primary)',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '1rem',
  },
  editActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '1.5rem',
  },
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
    position: 'relative',
    paddingLeft: '1.5rem',
    borderLeft: '2px solid var(--border-color)',
    marginLeft: '0.5rem',
    gap: '2rem',
  },
  timelineItem: {
    position: 'relative',
  },
  timelineBadge: {
    position: 'absolute',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: 'var(--primary)',
    left: '-22px',
    top: '1.5rem',
    border: '2px solid var(--bg-main)',
  },
  timelineCard: {
    padding: '1.5rem',
  },
  timelineCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '0.75rem',
    marginBottom: '1rem',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  consultDate: {
    fontSize: '0.9rem',
    fontWeight: '700',
    color: 'var(--primary)',
  },
  consultDoctor: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    fontWeight: '500',
  },
  vitalsRow: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  vitalTag: {
    fontSize: '0.7rem',
    padding: '0.2rem 0.5rem',
    backgroundColor: 'var(--bg-input)',
    borderRadius: '4px',
    color: 'var(--text-main)',
    fontWeight: '600',
    border: '1px solid var(--border-color)',
  },
  consultField: {
    marginBottom: '0.85rem',
  },
  fieldLabel: {
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
    fontWeight: '700',
    marginBottom: '0.15rem',
  },
  fieldText: {
    fontSize: '0.9rem',
    color: 'var(--text-main)',
    lineHeight: '1.5',
    whiteSpace: 'pre-line',
  },
  historyBlock: {
    padding: '1.5rem',
  },
  historyBlockTitle: {
    fontSize: '0.9rem',
    fontWeight: '700',
    color: 'var(--primary)',
    marginBottom: '0.75rem',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '0.25rem',
  },
  historyBlockText: {
    fontSize: '0.875rem',
    color: 'var(--text-main)',
    whiteSpace: 'pre-line',
  },
  uploadStudyCard: {
    padding: '1.25rem',
    marginBottom: '1.5rem',
    border: '1px dashed var(--border-color)',
  },
  uploadForm: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  studiesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  studyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.5rem',
  },
  studyInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  studyNameText: {
    fontSize: '0.9rem',
    fontWeight: '700',
  },
  studyMeta: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  },
  studyActions: {},
}
