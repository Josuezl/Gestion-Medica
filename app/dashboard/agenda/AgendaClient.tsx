'use client'

import React, { useState, useTransition } from 'react'
import { createAppointment, updateAppointmentStatus } from './actions'
import { 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  X, 
  UserCheck, 
  Clipboard,
  CalendarDays,
  Loader2
} from 'lucide-react'

const HN_TZ = 'America/Tegucigalpa'

interface AgendaClientProps {
  patients: any[]
  initialAppointments: any[]
}

export default function AgendaClient({
  patients,
  initialAppointments
}: AgendaClientProps) {
  // Estado para la fecha seleccionada en la vista (YYYY-MM-DD)
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: HN_TZ })
  const [selectedDate, setSelectedDate] = useState(todayStr)
  
  // Estado para abrir formulario de agendamiento
  const [showAddForm, setShowAddForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [statusPending, startStatusTransition] = useTransition()

  // Navegación de días
  function handlePrevDay() {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  function handleNextDay() {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  function handleGoToday() {
    setSelectedDate(todayStr)
  }

  // Enviar formulario de agendamiento
  async function handleAddSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(event.currentTarget)
    const result = await createAppointment(formData)

    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setShowAddForm(false)
      event.currentTarget.reset()
      alert('Cita programada con éxito.')
    }
  }

  // Cambiar estado de una cita
  function handleStatusChange(appointmentId: string, newStatus: string) {
    startStatusTransition(async () => {
      const result = await updateAppointmentStatus(appointmentId, newStatus)
      if (result.error) {
        alert(result.error)
      }
    })
  }

  // Filtrar citas para la fecha seleccionada
  const filteredAppointments = initialAppointments.filter((app) => {
    const appDateHN = new Date(app.scheduled_at).toLocaleDateString('en-CA', { timeZone: HN_TZ })
    return appDateHN === selectedDate
  })

  return (
    <div style={styles.container} className="animate-fade-in">
      {/* Title */}
      <div>
        <h2 style={styles.title}>Agenda del Consultorio</h2>
        <p style={styles.subtitle}>Gestión de citas médicas y control de sala de espera</p>
      </div>

      <div style={styles.workspaceLayout}>
        {/* Left Side: Agenda Day View */}
        <div style={styles.mainTimeline}>
          {/* Day Navigation Bar */}
          <div className="card" style={styles.navBar}>
            <div style={styles.navControls}>
              <button className="btn btn-secondary" style={styles.navBtn} onClick={handlePrevDay}>
                <ChevronLeft size={18} />
              </button>
              <div style={styles.navDateWrapper}>
                <CalendarDays size={20} color="var(--primary)" />
                <span style={styles.navDateText}>
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-HN', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    timeZone: HN_TZ
                  })}
                </span>
              </div>
              <button className="btn btn-secondary" style={styles.navBtn} onClick={handleNextDay}>
                <ChevronRight size={18} />
              </button>
            </div>
            
            <div style={styles.navActions}>
              <button className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={handleGoToday}>
                Hoy
              </button>
              <button className="btn btn-primary" style={{ gap: '0.4rem', fontSize: '0.85rem' }} onClick={() => setShowAddForm(true)}>
                <Plus size={16} />
                Programar Cita
              </button>
            </div>
          </div>

          {/* Appointments Grid */}
          <div className="card" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
            {filteredAppointments.length === 0 ? (
              <div style={styles.emptyState}>
                <CalendarIcon size={56} color="var(--text-muted)" style={{ opacity: 0.5, marginBottom: '1.25rem' }} />
                <h3>No hay citas para este día</h3>
                <p style={styles.emptySubtext}>Los pacientes pueden agendar citas mediante WhatsApp, o puedes hacerlo manualmente arriba.</p>
              </div>
            ) : (
              <div style={styles.appointmentsList}>
                {filteredAppointments.map((app) => {
                  const patient = app.patients
                  const appTime = new Date(app.scheduled_at).toLocaleTimeString('es-HN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: HN_TZ
                  })

                  return (
                    <div key={app.id} style={{
                      ...styles.appointmentRow,
                      borderLeft: `4px solid ${
                        app.status === 'COMPLETED' ? 'var(--success)' :
                        app.status === 'WAITING' ? 'var(--warning)' :
                        app.status === 'CANCELLED' ? 'var(--danger)' : 'var(--primary)'
                      }`
                    }}>
                      <div style={styles.rowTimeWrapper}>
                        <Clock size={16} color="var(--primary)" />
                        <span style={styles.rowTime}>{appTime}</span>
                      </div>

                      <div style={styles.rowPatientWrapper}>
                        {patient ? (
                          <>
                            <p style={styles.patientName}>{patient.first_name} {patient.last_name}</p>
                            <p style={styles.patientPhone}>Tel: {patient.phone} • DNI: {patient.id_card || 'N/D'}</p>
                          </>
                        ) : (
                          <p style={{ ...styles.patientName, fontStyle: 'italic', color: 'var(--text-muted)' }}>Cita sin paciente registrado</p>
                        )}
                        {app.notes && <p style={styles.rowNotes}>Nota: {app.notes}</p>}
                      </div>

                      <div style={styles.rowStatusAndActions}>
                        {/* Badge */}
                        <span className={`badge ${
                          app.status === 'COMPLETED' ? 'badge-success' :
                          app.status === 'WAITING' ? 'badge-warning' :
                          app.status === 'CANCELLED' ? 'badge-danger' : 'badge-info'
                        }`}>
                          {app.status === 'PENDING' ? 'Pendiente' :
                           app.status === 'CONFIRMED' ? 'Confirmada' :
                           app.status === 'WAITING' ? 'En Espera' :
                           app.status === 'COMPLETED' ? 'Completada' :
                           app.status === 'CANCELLED' ? 'Cancelada' : app.status}
                        </span>

                        {/* Interactive flow options */}
                        {app.status !== 'COMPLETED' && app.status !== 'CANCELLED' && (
                          <div style={styles.actionsGroup}>
                            {/* Si es CONFIRMED, dar opción de marcar "En Sala de Espera" (WAITING) */}
                            {app.status === 'CONFIRMED' && (
                              <button 
                                className="btn btn-secondary" 
                                style={styles.actionIconBtn}
                                onClick={() => handleStatusChange(app.id, 'WAITING')}
                                title="Marcar en sala de espera"
                              >
                                <UserCheck size={14} color="var(--warning)" />
                                <span style={styles.btnLabelInline}>Llegó</span>
                              </button>
                            )}

                            {/* Iniciar consulta */}
                            {patient && (
                              <a 
                                href={`/dashboard/consultations/new?patientId=${patient.id}&appointmentId=${app.id}`}
                                className="btn btn-primary"
                                style={{ ...styles.actionIconBtn, padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                                title="Iniciar consulta clínica"
                              >
                                <Clipboard size={14} />
                                <span style={styles.btnLabelInline}>Atender</span>
                              </a>
                            )}

                            {/* Cancelar */}
                            <button 
                              className="btn btn-secondary" 
                              style={styles.actionIconBtn}
                              onClick={() => handleStatusChange(app.id, 'CANCELLED')}
                              title="Cancelar Cita"
                            >
                              <X size={14} color="var(--danger)" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Appointment Creation Panel (Conditional Drawer) */}
        {showAddForm && (
          <div className="card animate-fade-in" style={styles.formPanel}>
            <div style={styles.formHeader}>
              <h3 style={{ fontSize: '1rem', fontWeight: '800' }}>Programar Cita Manual</h3>
              <button 
                style={styles.formCloseBtn} 
                onClick={() => setShowAddForm(false)}
              >
                <X size={18} />
              </button>
            </div>

            {error && <div className="badge badge-danger" style={{ padding: '0.5rem', marginBottom: '1rem', width: '100%' }}>{error}</div>}

            <form onSubmit={handleAddSubmit} style={styles.addForm}>
              <div className="form-group">
                <label className="form-label" htmlFor="patient_id">Paciente *</label>
                <select className="form-input" id="patient_id" name="patient_id" required>
                  <option value="">Selecciona un paciente...</option>
                  {patients.map((pat) => (
                    <option key={pat.id} value={pat.id}>
                      {pat.last_name}, {pat.first_name} ({pat.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.formGrid}>
                <div className="form-group">
                  <label className="form-label" htmlFor="date">Fecha *</label>
                  <input className="form-input" type="date" id="date" name="date" defaultValue={selectedDate} required />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="time">Hora *</label>
                  <input className="form-input" type="time" id="time" name="time" required />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="notes">Notas o Motivo de Cita</label>
                <textarea className="form-input" id="notes" name="notes" placeholder="Ej. Control mensual, dolor de cabeza..." rows={3} />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', gap: '0.4rem', marginTop: '1rem' }} disabled={loading}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Agendar Cita
              </button>
            </form>
          </div>
        )}
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
  title: {
    fontSize: '1.5rem',
    fontWeight: '700',
  },
  subtitle: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
  },
  workspaceLayout: {
    display: 'flex',
    gap: '1.5rem',
    alignItems: 'start',
    flexWrap: 'wrap',
  },
  mainTimeline: {
    flex: 2,
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    minWidth: '320px',
  },
  navBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  navControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  navBtn: {
    padding: '0.5rem',
    borderRadius: '8px',
  },
  navDateWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  navDateText: {
    fontSize: '0.95rem',
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  navActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  emptyState: {
    padding: '5rem 2rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    flex: 1,
  },
  emptySubtext: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
    maxWidth: '400px',
    marginTop: '0.5rem',
  },
  appointmentsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  appointmentRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '1rem 1.25rem',
    backgroundColor: 'var(--bg-input)',
    borderRadius: '10px',
    border: '1px solid var(--border-color)',
    gap: '1.5rem',
    transition: 'all var(--transition-fast)',
    flexWrap: 'wrap',
  },
  rowTimeWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    minWidth: '95px',
  },
  rowTime: {
    fontSize: '0.9rem',
    fontWeight: '800',
    color: 'var(--text-main)',
  },
  rowPatientWrapper: {
    flex: 1,
    minWidth: '180px',
  },
  patientName: {
    fontSize: '0.925rem',
    fontWeight: '700',
  },
  patientPhone: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  },
  rowNotes: {
    fontSize: '0.75rem',
    marginTop: '0.25rem',
    color: 'var(--primary)',
    fontWeight: '600',
  },
  rowStatusAndActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  actionsGroup: {
    display: 'flex',
    gap: '0.35rem',
  },
  actionIconBtn: {
    padding: '0.35rem 0.5rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.7rem',
  },
  btnLabelInline: {
    fontWeight: '700',
  },
  formPanel: {
    flex: 1,
    minWidth: '300px',
    padding: '1.5rem',
    position: 'sticky',
    top: '95px',
  },
  formHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.25rem',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '0.5rem',
  },
  formCloseBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
  },
  addForm: {
    display: 'flex',
    flexDirection: 'column',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
  },
}
