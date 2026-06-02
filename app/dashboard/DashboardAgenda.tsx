'use client'

import React, { useState, useTransition } from 'react'
import { createAppointment, updateAppointmentStatus } from './agenda/actions'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  Clock,
  UserCheck,
  Clipboard,
  X,
  Check,
  Loader2,
  MessageCircle
} from 'lucide-react'

function calculateAge(birthDateString: string) {
  const today = new Date()
  const birthDate = new Date(birthDateString)
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
  return age
}

interface DashboardAgendaProps {
  appointments: any[]
  patients: any[]
}

export default function DashboardAgenda({ appointments, patients }: DashboardAgendaProps) {
  const todayStr = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [showAddForm, setShowAddForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [statusPending, startStatusTransition] = useTransition()

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

  const filteredAppointments = appointments.filter((app) => {
    const appDateStr = new Date(app.scheduled_at).toISOString().split('T')[0]
    return appDateStr === selectedDate
  })

  function handleStatusChange(appointmentId: string, newStatus: string) {
    startStatusTransition(async () => {
      const result = await updateAppointmentStatus(appointmentId, newStatus)
      if (result.error) alert(result.error)
    })
  }

  async function handleAddSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setFormLoading(true)
    const formData = new FormData(event.currentTarget)
    const result = await createAppointment(formData)
    setFormLoading(false)
    if (result.error) {
      setFormError(result.error)
    } else {
      setShowAddForm(false)
      event.currentTarget.reset()
    }
  }

  const isToday = selectedDate === todayStr
  const formattedDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-HN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return (
    <div className="card" style={styles.container}>
      {/* Date Navigation Bar */}
      <div style={styles.navBar}>
        <div style={styles.navControls}>
          <button className="btn btn-secondary" style={styles.navBtn} onClick={handlePrevDay}>
            <ChevronLeft size={18} />
          </button>
          <div style={styles.navDateWrapper}>
            <CalendarDays size={18} color="var(--primary)" />
            <span style={styles.navDateText}>{formattedDate}</span>
          </div>
          <button className="btn btn-secondary" style={styles.navBtn} onClick={handleNextDay}>
            <ChevronRight size={18} />
          </button>
        </div>

        <div style={styles.navActions}>
          {!isToday && (
            <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={handleGoToday}>
              Hoy
            </button>
          )}
          <button
            className="btn btn-primary"
            style={{ gap: '0.4rem', fontSize: '0.8rem' }}
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <Plus size={15} />
            Programar Cita
          </button>
        </div>
      </div>

      {/* Inline Add Form */}
      {showAddForm && (
        <div style={styles.addFormContainer} className="animate-fade-in">
          <div style={styles.formHeader}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: '700', margin: 0 }}>Programar Cita Rápida</h4>
            <button style={styles.formCloseBtn} onClick={() => setShowAddForm(false)}>
              <X size={16} />
            </button>
          </div>

          {formError && <div className="badge badge-danger" style={{ padding: '0.5rem', marginBottom: '0.75rem', width: '100%', fontSize: '0.75rem' }}>{formError}</div>}

          <form onSubmit={handleAddSubmit} style={styles.addForm}>
            <div style={styles.formGrid}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="dash-patient_id" style={{ fontSize: '0.75rem' }}>Paciente *</label>
                <select className="form-input" id="dash-patient_id" name="patient_id" required style={{ fontSize: '0.8rem', padding: '0.4rem 0.5rem' }}>
                  <option value="">Seleccionar...</option>
                  {patients.map((pat) => (
                    <option key={pat.id} value={pat.id}>
                      {pat.last_name}, {pat.first_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="dash-date" style={{ fontSize: '0.75rem' }}>Fecha *</label>
                <input className="form-input" type="date" id="dash-date" name="date" defaultValue={selectedDate} required style={{ fontSize: '0.8rem', padding: '0.4rem 0.5rem' }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="dash-time" style={{ fontSize: '0.75rem' }}>Hora *</label>
                <input className="form-input" type="time" id="dash-time" name="time" required style={{ fontSize: '0.8rem', padding: '0.4rem 0.5rem' }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="dash-notes" style={{ fontSize: '0.75rem' }}>Notas</label>
                <input className="form-input" id="dash-notes" name="notes" placeholder="Motivo..." style={{ fontSize: '0.8rem', padding: '0.4rem 0.5rem' }} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', gap: '0.3rem', marginTop: '0.75rem', fontSize: '0.8rem', padding: '0.5rem' }} disabled={formLoading}>
              {formLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Agendar
            </button>
          </form>
        </div>
      )}

      {/* Section Header */}
      <div style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>
          {isToday ? 'Agenda para Hoy' : `Agenda: ${formattedDate}`}
        </h3>
        <span className="badge badge-info">{filteredAppointments.length} Citas</span>
      </div>

      {/* Appointments List */}
      <div style={styles.listWrapper}>
        {filteredAppointments.length === 0 ? (
          <div style={styles.emptyState}>
            <CalendarIcon size={44} color="var(--text-muted)" style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
            <p style={styles.emptyText}>No hay citas programadas para este día.</p>
          </div>
        ) : (
          filteredAppointments.map((appointment) => {
            const patient = appointment.patients as any
            const apptDate = new Date(appointment.scheduled_at)
            const formattedTime = apptDate.toLocaleTimeString('es-HN', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            })
            const patientPhone = patient?.phone?.replace('+', '') || ''

            return (
              <div key={appointment.id} style={{
                ...styles.appointmentRow,
                borderLeft: `4px solid ${
                  appointment.status === 'COMPLETED' ? 'var(--success)' :
                  appointment.status === 'WAITING' ? 'var(--warning)' :
                  appointment.status === 'CANCELLED' ? '#ef4444' : 'var(--primary)'
                }`,
                opacity: appointment.status === 'CANCELLED' ? 0.5 : 1,
              }}>
                <div style={styles.appointmentTimeWrapper}>
                  <span style={styles.appointmentTime}>{formattedTime}</span>
                  <span style={styles.appointmentTimeSub}>GMT-6</span>
                </div>

                <div style={styles.patientDetails}>
                  <p style={styles.patientName}>
                    {patient ? `${patient.first_name} ${patient.last_name}` : 'Sin registrar'}
                  </p>
                  <p style={styles.patientSub}>
                    {patient ? `${calculateAge(patient.birth_date)} años • Tel: ${patient.phone}` : 'Vía WhatsApp Bot'}
                  </p>
                  {appointment.notes && <p style={styles.appointmentNotes}>📋 {appointment.notes}</p>}
                </div>

                <div style={styles.rowActions}>
                  {/* Status Badge */}
                  <span className={`badge ${
                    appointment.status === 'CONFIRMED' ? 'badge-success' :
                    appointment.status === 'PENDING' ? 'badge-warning' :
                    appointment.status === 'WAITING' ? 'badge-warning' :
                    appointment.status === 'COMPLETED' ? 'badge-success' :
                    appointment.status === 'CANCELLED' ? 'badge-danger' : 'badge-info'
                  }`} style={{ fontSize: '0.68rem' }}>
                    {appointment.status === 'CONFIRMED' ? 'Confirmada' :
                     appointment.status === 'PENDING' ? 'Pendiente' :
                     appointment.status === 'WAITING' ? 'En Espera' :
                     appointment.status === 'COMPLETED' ? 'Completada' :
                     appointment.status === 'CANCELLED' ? 'Cancelada' : appointment.status}
                  </span>

                  {/* Action Buttons */}
                  {appointment.status !== 'COMPLETED' && appointment.status !== 'CANCELLED' && (
                    <div style={styles.actionsGroup}>
                      {/* Mark as Waiting */}
                      {appointment.status === 'CONFIRMED' && (
                        <button
                          className="btn btn-secondary"
                          style={styles.actionBtn}
                          onClick={() => handleStatusChange(appointment.id, 'WAITING')}
                          title="Marcar en sala de espera"
                        >
                          <UserCheck size={13} color="var(--warning)" />
                          <span style={styles.btnLabel}>Llegó</span>
                        </button>
                      )}

                      {/* Confirm */}
                      {appointment.status === 'PENDING' && (
                        <button
                          className="btn btn-secondary"
                          style={styles.actionBtn}
                          onClick={() => handleStatusChange(appointment.id, 'CONFIRMED')}
                          title="Confirmar cita"
                        >
                          <Check size={13} color="var(--success)" />
                          <span style={styles.btnLabel}>Confirmar</span>
                        </button>
                      )}

                      {/* Start Consultation */}
                      {patient && (
                        <a
                          href={`/dashboard/consultations/new?patientId=${patient.id}&appointmentId=${appointment.id}`}
                          className="btn btn-primary"
                          style={{ ...styles.actionBtn, fontSize: '0.72rem' }}
                          title="Iniciar consulta"
                        >
                          <Clipboard size={13} />
                          <span style={styles.btnLabel}>Iniciar Consulta</span>
                        </a>
                      )}

                      {/* WhatsApp Reminder */}
                      {patient && patientPhone && (
                        <a
                          href={`https://wa.me/${patientPhone}?text=${encodeURIComponent(`Hola ${patient.first_name}, le recordamos su cita programada para el ${formattedDate} a las ${formattedTime}. ¡Le esperamos!`)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary"
                          style={{ ...styles.actionBtn, backgroundColor: '#dcf8c6', color: '#128C7E', border: 'none' }}
                          title="Enviar recordatorio por WhatsApp"
                        >
                          <MessageCircle size={13} />
                        </a>
                      )}

                      {/* Cancel */}
                      <button
                        className="btn btn-secondary"
                        style={styles.actionBtn}
                        onClick={() => handleStatusChange(appointment.id, 'CANCELLED')}
                        title="Cancelar cita"
                      >
                        <X size={13} color="#ef4444" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
  },
  navBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '1rem',
    borderBottom: '1px solid var(--border-color)',
    marginBottom: '1rem',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  navControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  navBtn: {
    padding: '0.4rem',
    borderRadius: '8px',
  },
  navDateWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  navDateText: {
    fontSize: '0.9rem',
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  navActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  addFormContainer: {
    padding: '1rem',
    marginBottom: '1rem',
    backgroundColor: 'rgba(13, 148, 136, 0.04)',
    borderRadius: '10px',
    border: '1px solid rgba(13, 148, 136, 0.15)',
  },
  formHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '0.6rem',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: '700',
  },
  listWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2.5rem 1.5rem',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
  },
  appointmentRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.85rem 1rem',
    backgroundColor: 'var(--bg-input)',
    borderRadius: '10px',
    border: '1px solid var(--border-color)',
    gap: '1.25rem',
    transition: 'border-color var(--transition-fast)',
    flexWrap: 'wrap',
  },
  appointmentTimeWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRight: '1px solid var(--border-color)',
    paddingRight: '1rem',
    minWidth: '80px',
  },
  appointmentTime: {
    fontSize: '0.9rem',
    fontWeight: '700',
    color: 'var(--primary)',
  },
  appointmentTimeSub: {
    fontSize: '0.6rem',
    color: 'var(--text-muted)',
    fontWeight: '600',
  },
  patientDetails: {
    flex: 1,
    minWidth: '150px',
  },
  patientName: {
    fontSize: '0.9rem',
    fontWeight: '700',
  },
  patientSub: {
    fontSize: '0.72rem',
    color: 'var(--text-muted)',
  },
  appointmentNotes: {
    fontSize: '0.72rem',
    color: 'var(--primary)',
    fontWeight: '600',
    marginTop: '0.15rem',
  },
  rowActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  actionsGroup: {
    display: 'flex',
    gap: '0.3rem',
    flexWrap: 'wrap',
  },
  actionBtn: {
    padding: '0.3rem 0.5rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.2rem',
    fontSize: '0.7rem',
  },
  btnLabel: {
    fontWeight: '700',
  },
}
