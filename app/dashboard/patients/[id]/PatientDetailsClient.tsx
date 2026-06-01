'use client'

import React, { useState, useTransition } from 'react'
import { updatePatient, uploadMedicalStudy } from '../actions'
import { sendMedicalRecordByEmail, sendPrescriptionByEmail, updatePrescription } from './email-actions'
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
  Plus,
  Printer,
  Share2,
  MessageCircle,
  Pill,
  ChevronDown,
  ChevronUp,
  Save,
  X,
  Trash2
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
  const [expandedPrescription, setExpandedPrescription] = useState<string | null>(null)
  const [editingPrescription, setEditingPrescription] = useState<string | null>(null)
  const [editMedicines, setEditMedicines] = useState<{ name: string; dose: string; frequency: string; duration: string }[]>([])
  const [editNotes, setEditNotes] = useState('')
  const [savingPrescription, setSavingPrescription] = useState(false)
  const [prescSaveMsg, setPrescSaveMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null)
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

  const printMedicalRecord = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const html = `
      <html>
        <head>
          <title>Ficha Médica - ${patient.first_name} ${patient.last_name}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; color: #333; line-height: 1.5; }
            h1 { border-bottom: 2px solid #0d9488; padding-bottom: 10px; color: #0d9488; }
            h2 { margin-top: 30px; color: #0d9488; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
            .row { display: flex; flex-wrap: wrap; margin-bottom: 15px; }
            .col { flex: 1; min-width: 200px; margin-bottom: 10px; }
            .label { font-weight: bold; color: #666; font-size: 12px; text-transform: uppercase; }
            .value { font-size: 16px; margin-top: 4px; }
            .alert { color: #d9534f; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>Ficha Médica Clínica</h1>
          <div class="row">
            <div class="col"><div class="label">Paciente</div><div class="value">${patient.first_name} ${patient.last_name}</div></div>
            <div class="col"><div class="label">Identidad (DNI)</div><div class="value">${patient.id_card || 'N/A'}</div></div>
            <div class="col"><div class="label">Edad / Sexo</div><div class="value">${calculateAge(patient.birth_date)} años / ${patient.gender === 'M' ? 'Masculino' : patient.gender === 'F' ? 'Femenino' : 'Otro'}</div></div>
          </div>
          <div class="row">
            <div class="col"><div class="label">Teléfono</div><div class="value">${patient.phone || 'N/A'}</div></div>
            <div class="col"><div class="label">Correo</div><div class="value">${patient.email || 'N/A'}</div></div>
            <div class="col"><div class="label">Tipo de Sangre</div><div class="value">${patient.blood_type || 'N/A'}</div></div>
          </div>
          
          <div style="margin-top: 20px; padding: 15px; border: 1px solid #ff9800; background: #fff3e0; border-radius: 5px;">
            <div class="label" style="color: #e65100;">Alergias</div>
            <div class="value alert">${patient.allergies || 'Ninguna conocida'}</div>
          </div>

          <h2>Antecedentes Patológicos</h2>
          <p>${patient.pathological_history || 'No declarados'}</p>

          <h2>Antecedentes No Patológicos</h2>
          <p>${patient.non_pathological_history || 'No declarados'}</p>

          <h2>Antecedentes Heredofamiliares</h2>
          <p>${patient.family_history || 'No declarados'}</p>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const generateFichaText = () => {
    return `*Ficha Médica*\nPaciente: ${patient.first_name} ${patient.last_name}\nEdad: ${calculateAge(patient.birth_date)} años\nDNI: ${patient.id_card || 'N/A'}\nSangre: ${patient.blood_type || 'N/A'}\nAlergias: ${patient.allergies || 'Ninguna'}\n\n*Antecedentes:*\nPatológicos: ${patient.pathological_history || 'N/A'}\nNo Patológicos: ${patient.non_pathological_history || 'N/A'}\nFamiliares: ${patient.family_history || 'N/A'}`;
  }

  const patientPhoneClean = patient.phone ? patient.phone.replace('+', '') : '';

  // Estados para envío de correo
  const [sendingFichaEmail, setSendingFichaEmail] = useState(false)
  const [fichaEmailMsg, setFichaEmailMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [sendingPrescEmail, setSendingPrescEmail] = useState<string | null>(null)
  const [prescEmailMsg, setPrescEmailMsg] = useState<{ type: 'success' | 'error', text: string, id?: string } | null>(null)

  const handleSendFichaEmail = async () => {
    setSendingFichaEmail(true)
    setFichaEmailMsg(null)
    try {
      const result = await sendMedicalRecordByEmail(patient.id)
      if (result.error) {
        setFichaEmailMsg({ type: 'error', text: result.error })
      } else {
        setFichaEmailMsg({ type: 'success', text: `✅ Ficha médica enviada a ${patient.email}` })
        setTimeout(() => setFichaEmailMsg(null), 5000)
      }
    } catch {
      setFichaEmailMsg({ type: 'error', text: 'Error de conexión al enviar correo.' })
    }
    setSendingFichaEmail(false)
  }

  const handleSendPrescriptionEmail = async (prescriptionId: string) => {
    setSendingPrescEmail(prescriptionId)
    setPrescEmailMsg(null)
    try {
      const result = await sendPrescriptionByEmail(patient.id, prescriptionId)
      if (result.error) {
        setPrescEmailMsg({ type: 'error', text: result.error, id: prescriptionId })
      } else {
        setPrescEmailMsg({ type: 'success', text: `✅ Receta enviada a ${patient.email}`, id: prescriptionId })
        setTimeout(() => setPrescEmailMsg(null), 5000)
      }
    } catch {
      setPrescEmailMsg({ type: 'error', text: 'Error de conexión al enviar correo.', id: prescriptionId })
    }
    setSendingPrescEmail(null)
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
            <button onClick={printMedicalRecord} className="btn btn-secondary" style={{ gap: '0.4rem', backgroundColor: '#e2e8f0', color: '#0f172a', border: 'none' }}>
              <Printer size={16} />
              Imprimir Ficha
            </button>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <a 
                href={`https://wa.me/${patientPhoneClean}?text=${encodeURIComponent(generateFichaText())}`} 
                target="_blank" 
                rel="noreferrer"
                className="btn btn-secondary" 
                style={{ padding: '0.5rem', backgroundColor: '#dcf8c6', color: '#128C7E', border: 'none' }}
                title="Enviar Ficha por WhatsApp"
              >
                <MessageCircle size={16} />
              </a>
              <button 
                onClick={handleSendFichaEmail}
                disabled={sendingFichaEmail}
                className="btn btn-secondary" 
                style={{ padding: '0.5rem', backgroundColor: sendingFichaEmail ? '#c7d2fe' : '#e0e7ff', color: '#4338ca', border: 'none', cursor: sendingFichaEmail ? 'wait' : 'pointer' }}
                title="Enviar Ficha por Correo Electrónico"
              >
                {sendingFichaEmail ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
              </button>
            </div>
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

        {/* Email Notification Toast */}
        {fichaEmailMsg && (
          <div style={{
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: '600',
            backgroundColor: fichaEmailMsg.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: fichaEmailMsg.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${fichaEmailMsg.type === 'success' ? '#86efac' : '#fecaca'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            animation: 'fadeIn 0.3s ease-out',
          }}>
            {fichaEmailMsg.text}
          </div>
        )}
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

                          {/* Medicamentos recetados en esta consulta */}
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
                        {/* Header Row */}
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
                            {presc.pdf_url && (
                              <a href={presc.pdf_url} target="_blank" className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', gap: '0.25rem' }}>
                                <Printer size={14} />
                                Imprimir
                              </a>
                            )}
                            <a 
                              href={`https://wa.me/${patientPhoneClean}?text=${encodeURIComponent(`Hola ${patient.first_name}, te comparto tu receta médica. Código: ${presc.verification_code}${presc.pdf_url ? `. Descárgala aquí: ${presc.pdf_url}` : ''}`)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-secondary" 
                              style={{ padding: '0.4rem 0.6rem', backgroundColor: '#dcf8c6', color: '#128C7E', border: 'none' }}
                              title="Enviar Receta por WhatsApp"
                            >
                              <MessageCircle size={14} />
                            </a>
                            <button
                              onClick={() => handleSendPrescriptionEmail(presc.id)}
                              disabled={sendingPrescEmail === presc.id}
                              className="btn btn-secondary" 
                              style={{ padding: '0.4rem 0.6rem', backgroundColor: sendingPrescEmail === presc.id ? '#c7d2fe' : '#e0e7ff', color: '#4338ca', border: 'none', cursor: sendingPrescEmail === presc.id ? 'wait' : 'pointer' }}
                              title="Enviar Receta por Correo Electrónico"
                            >
                              {sendingPrescEmail === presc.id ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                            </button>
                          </div>
                        </div>

                        {/* Expanded Medicine Details */}
                        {isExpanded && (
                          <div style={{
                            marginTop: '1rem',
                            padding: '1rem',
                            backgroundColor: 'rgba(13, 148, 136, 0.04)',
                            borderRadius: '8px',
                            border: `1px solid ${editingPrescription === presc.id ? 'var(--primary)' : 'rgba(13, 148, 136, 0.12)'}`,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Pill size={16} color="var(--primary)" />
                                <p style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--primary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Medicamentos Recetados</p>
                              </div>
                              {editingPrescription !== presc.id ? (
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '0.3rem 0.7rem', fontSize: '0.72rem', gap: '0.25rem' }}
                                  onClick={() => {
                                    setEditingPrescription(presc.id)
                                    setEditMedicines((presc.medicines || []).map((m: any) => ({ name: m.name || '', dose: m.dose || '', frequency: m.frequency || '', duration: m.duration || '' })))
                                    setEditNotes(presc.notes || '')
                                    setPrescSaveMsg(null)
                                  }}
                                >
                                  <Edit size={12} />
                                  Editar Receta
                                </button>
                              ) : (
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                  <button
                                    className="btn btn-primary"
                                    style={{ padding: '0.3rem 0.7rem', fontSize: '0.72rem', gap: '0.25rem' }}
                                    disabled={savingPrescription}
                                    onClick={async () => {
                                      setSavingPrescription(true)
                                      setPrescSaveMsg(null)
                                      const result = await updatePrescription(presc.id, editMedicines, editNotes)
                                      if (result.error) {
                                        setPrescSaveMsg({ type: 'error', text: result.error })
                                      } else {
                                        setPrescSaveMsg({ type: 'success', text: '✅ Receta actualizada exitosamente' })
                                        setEditingPrescription(null)
                                        setTimeout(() => setPrescSaveMsg(null), 4000)
                                      }
                                      setSavingPrescription(false)
                                    }}
                                  >
                                    {savingPrescription ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                    Guardar
                                  </button>
                                  <button
                                    className="btn btn-secondary"
                                    style={{ padding: '0.3rem 0.7rem', fontSize: '0.72rem', gap: '0.25rem' }}
                                    onClick={() => {
                                      setEditingPrescription(null)
                                      setPrescSaveMsg(null)
                                    }}
                                  >
                                    <X size={12} />
                                    Cancelar
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Medicine Table */}
                            {editingPrescription === presc.id ? (
                              /* EDIT MODE */
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                {/* Table Header */}
                                <div style={{
                                  display: 'grid',
                                  gridTemplateColumns: '2fr 1fr 1fr 1fr auto',
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
                                  <span></span>
                                </div>
                                {editMedicines.map((med, idx) => (
                                  <div key={idx} style={{
                                    display: 'grid',
                                    gridTemplateColumns: '2fr 1fr 1fr 1fr auto',
                                    gap: '0.5rem',
                                    padding: '0.35rem 0.5rem',
                                    backgroundColor: 'var(--bg-card)',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color)',
                                    alignItems: 'center',
                                  }}>
                                    <input className="form-input" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', margin: 0 }} value={med.name} placeholder="Medicamento" onChange={(e) => { const n = [...editMedicines]; n[idx].name = e.target.value; setEditMedicines(n) }} />
                                    <input className="form-input" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', margin: 0 }} value={med.dose} placeholder="Ej. 500mg" onChange={(e) => { const n = [...editMedicines]; n[idx].dose = e.target.value; setEditMedicines(n) }} />
                                    <input className="form-input" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', margin: 0 }} value={med.frequency} placeholder="Ej. c/8h" onChange={(e) => { const n = [...editMedicines]; n[idx].frequency = e.target.value; setEditMedicines(n) }} />
                                    <input className="form-input" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', margin: 0 }} value={med.duration} placeholder="Ej. 7 días" onChange={(e) => { const n = [...editMedicines]; n[idx].duration = e.target.value; setEditMedicines(n) }} />
                                    <button onClick={() => { const n = editMedicines.filter((_, i) => i !== idx); setEditMedicines(n) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: '#ef4444' }} title="Eliminar medicamento">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  onClick={() => setEditMedicines([...editMedicines, { name: '', dose: '', frequency: '', duration: '' }])}
                                  className="btn btn-secondary"
                                  style={{ padding: '0.35rem 0.8rem', fontSize: '0.75rem', gap: '0.3rem', alignSelf: 'flex-start', marginTop: '0.25rem' }}
                                >
                                  <Plus size={13} />
                                  Agregar Medicamento
                                </button>

                                {/* Editable Notes */}
                                <div style={{ marginTop: '0.5rem' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📝 Indicaciones</label>
                                  <textarea
                                    className="form-input"
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    rows={2}
                                    style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}
                                    placeholder="Indicaciones adicionales de la receta..."
                                  />
                                </div>
                              </div>
                            ) : (
                              /* VIEW MODE */
                              <>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                  {/* Table Header */}
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
                                  {/* Medicine Rows */}
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
                              </>
                            )}

                            {/* Save Message */}
                            {prescSaveMsg && prescSaveMsg.text && (
                              <div style={{
                                marginTop: '0.75rem',
                                padding: '0.5rem 0.8rem',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                fontWeight: '600',
                                backgroundColor: prescSaveMsg.type === 'success' ? '#dcfce7' : '#fee2e2',
                                color: prescSaveMsg.type === 'success' ? '#166534' : '#991b1b',
                              }}>
                                {prescSaveMsg.text}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Prescription Email Toast */}
              {prescEmailMsg && (
                <div style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  backgroundColor: prescEmailMsg.type === 'success' ? '#dcfce7' : '#fee2e2',
                  color: prescEmailMsg.type === 'success' ? '#166534' : '#991b1b',
                  border: `1px solid ${prescEmailMsg.type === 'success' ? '#86efac' : '#fecaca'}`,
                  animation: 'fadeIn 0.3s ease-out',
                }}>
                  {prescEmailMsg.text}
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
