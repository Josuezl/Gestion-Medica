'use client'

import React, { useState, useMemo } from 'react'
import { createAppointment, updateAppointmentStatus, updateAppointment } from './actions'
import { 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  Search, 
  Plus,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Stethoscope,
  Phone,
  MoreHorizontal
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================
type ViewMode = 'agenda' | 'day' | 'week' | 'month'

interface Doctor {
  id: string
  first_name: string
  last_name: string
  role: string
}

interface Patient {
  id: string
  first_name: string
  last_name: string
  phone: string
  birth_date?: string
  gender?: string
  id_card?: string
}

interface Appointment {
  id: string
  scheduled_at: string
  status: string
  notes: string | null
  duration_minutes: number
  doctor_id: string
  patients: Patient | null
}

interface AgendaClientProps {
  patients: Patient[]
  initialAppointments: Appointment[]
  doctors: Doctor[]
  currentDoctor: { id: string; role: string }
}

// ============================================================================
// HELPERS
// ============================================================================
const STATUS_CONFIG: Record<string, { label: string, color: string, icon: string, class: string }> = {
  PENDING: { label: 'Pendiente', color: '#f3f4f6', icon: '📁', class: 'status-pending' },
  WAITING: { label: 'En sala', color: '#fef3c7', icon: '📂', class: 'status-waiting' },
  IN_PROGRESS: { label: 'En consulta', color: '#dbeafe', icon: '🏥', class: 'status-in-progress' },
  COMPLETED: { label: 'Realizada', color: '#d1fae5', icon: '✅', class: 'status-completed' },
  CANCELLED: { label: 'Cancelada', color: '#fee2e2', icon: '❌', class: 'status-cancelled' },
  NO_SHOW: { label: 'No vino', color: '#e5e7eb', icon: '👎', class: 'status-no-show' },
}

const DURATIONS = [15, 30, 45, 60]

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay()

const formatDateYMD = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const getWeekDays = (date: Date) => {
  const current = new Date(date)
  const first = current.getDate() - current.getDay()
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(current)
    d.setDate(first + i)
    return d
  })
}

// ============================================================================
// STATUS DROPDOWN COMPONENT
// ============================================================================
function StatusDropdown({ status, onChange }: { status: string, onChange: (newStatus: string) => void }) {
  const [open, setOpen] = useState(false)
  const current = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING

  return (
    <div className="status-dropdown-container" onMouseLeave={() => setOpen(false)}>
      <div 
        className="status-dropdown-trigger" 
        onClick={() => setOpen(!open)}
        style={{ backgroundColor: current.color }}
      >
        <span>{current.icon}</span>
        {current.label}
      </div>
      {open && (
        <div className="status-dropdown-menu">
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <button
              key={key}
              className={`status-dropdown-item ${status === key ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onChange(key)
                setOpen(false)
              }}
            >
              <span>{config.icon}</span>
              {config.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function AgendaClient({ patients, initialAppointments, doctors, currentDoctor }: AgendaClientProps) {
  // --- State ---
  const [viewMode, setViewMode] = useState<ViewMode>('agenda')
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [includeCancelled, setIncludeCancelled] = useState(false)
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(currentDoctor.role === 'ASSISTANT' ? 'all' : currentDoctor.id)
  
  const [showForm, setShowForm] = useState(false)
  const [editAppointment, setEditAppointment] = useState<Appointment | null>(null)
  
  // --- Derived Data ---
  const filteredAppointments = useMemo(() => {
    return initialAppointments.filter(app => {
      // Filtrar cancelados
      if (!includeCancelled && (app.status === 'CANCELLED' || app.status === 'NO_SHOW')) return false
      // Filtrar doctor
      if (selectedDoctorId !== 'all' && app.doctor_id !== selectedDoctorId) return false
      return true
    })
  }, [initialAppointments, includeCancelled, selectedDoctorId])

  const appointmentsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {}
    filteredAppointments.forEach(app => {
      const dateStr = formatDateYMD(new Date(app.scheduled_at))
      if (!map[dateStr]) map[dateStr] = []
      map[dateStr].push(app)
    })
    return map
  }, [filteredAppointments])

  // --- Actions ---
  const handleStatusChange = async (appId: string, newStatus: string) => {
    await updateAppointmentStatus(appId, newStatus)
  }

  const handleOpenForm = (date?: Date, hour?: number, app?: Appointment) => {
    if (app) {
      setEditAppointment(app)
      setShowForm(true)
      return
    }
    
    setEditAppointment(null)
    if (date) setSelectedDate(date)
    // We could pre-fill hour, but keeping it simple
    setShowForm(true)
  }

  const handlePrev = () => {
    const d = new Date(selectedDate)
    if (viewMode === 'day' || viewMode === 'agenda') d.setDate(d.getDate() - 1)
    if (viewMode === 'week') d.setDate(d.getDate() - 7)
    if (viewMode === 'month') d.setMonth(d.getMonth() - 1)
    setSelectedDate(d)
  }

  const handleNext = () => {
    const d = new Date(selectedDate)
    if (viewMode === 'day' || viewMode === 'agenda') d.setDate(d.getDate() + 1)
    if (viewMode === 'week') d.setDate(d.getDate() + 7)
    if (viewMode === 'month') d.setMonth(d.getMonth() + 1)
    setSelectedDate(d)
  }

  const handleToday = () => setSelectedDate(new Date())

  // ==========================================================================
  // RENDER: MINI CALENDAR
  // ==========================================================================
  const renderMiniCalendar = () => {
    const year = selectedDate.getFullYear()
    const month = selectedDate.getMonth()
    const daysInMonth = getDaysInMonth(year, month)
    const firstDay = getFirstDayOfMonth(year, month)
    
    const days = []
    const todayStr = formatDateYMD(new Date())
    const selectedStr = formatDateYMD(selectedDate)
    
    const weekDays = viewMode === 'week' ? getWeekDays(selectedDate).map(formatDateYMD) : []

    // Previous month padding
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="mini-calendar-day other-month"></div>)
    }
    
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      const dateStr = formatDateYMD(date)
      const isToday = dateStr === todayStr
      const isSelected = dateStr === selectedStr
      const inWeek = viewMode === 'week' && weekDays.includes(dateStr)
      const hasApps = !!appointmentsByDate[dateStr]

      let className = 'mini-calendar-day'
      if (isToday) className += ' today'
      if (isSelected && viewMode !== 'week') className += ' selected'
      if (inWeek && viewMode === 'week') className += ' week-highlight'
      if (hasApps) className += ' has-appointments'

      days.push(
        <div key={d} className={className} onClick={() => setSelectedDate(new Date(year, month, d))}>
          {d}
        </div>
      )
    }

    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

    return (
      <div className="mini-calendar">
        <div className="mini-calendar-header">
          <div className="mini-calendar-title">
            {monthNames[month]} {year}
          </div>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button className="mini-calendar-nav" onClick={() => {
              const d = new Date(selectedDate); d.setMonth(d.getMonth()-1); setSelectedDate(d)
            }}><ChevronLeft size={16}/></button>
            <button className="mini-calendar-nav" onClick={() => {
              const d = new Date(selectedDate); d.setMonth(d.getMonth()+1); setSelectedDate(d)
            }}><ChevronRight size={16}/></button>
          </div>
        </div>
        <div className="mini-calendar-grid">
          {['Do','Lu','Ma','Mi','Ju','Vi','Sá'].map(d => <div key={d} className="mini-calendar-day-header">{d}</div>)}
          {days}
        </div>
      </div>
    )
  }

  // ==========================================================================
  // RENDER: DAY VIEW
  // ==========================================================================
  const renderDayView = () => {
    const dateStr = formatDateYMD(selectedDate)
    const apps = appointmentsByDate[dateStr] || []
    
    const hours = Array.from({length: 14}, (_, i) => i + 7) // 7 AM to 8 PM

    return (
      <div className="time-grid">
        <div className="time-grid-header">
          <div className="time-grid-header-label">HGMT-6</div>
          <div className="time-grid-day-header is-today">
            {selectedDate.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric' })}
          </div>
        </div>
        <div className="time-grid-body">
          <div className="time-grid-labels">
            {hours.map(h => (
              <div key={h} className="time-label">
                {h === 12 ? '12 PM' : h > 12 ? `${h-12} PM` : `${h} AM`}
              </div>
            ))}
          </div>
          <div className="time-grid-columns">
            <div className="time-grid-column" onClick={() => handleOpenForm(selectedDate)}>
              {hours.map(h => (
                <div key={h} className="time-slot">
                  <div className="time-slot-half"></div>
                </div>
              ))}
              
              {apps.map(app => {
                const date = new Date(app.scheduled_at)
                const h = date.getHours()
                const m = date.getMinutes()
                
                if (h < 7 || h > 20) return null // Outside visible bounds
                
                const top = ((h - 7) * 60 + m)
                const height = app.duration_minutes || 15
                const cfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.PENDING

                return (
                  <div 
                    key={app.id} 
                    className={`appointment-block ${cfg.class}`}
                    style={{ top: `${top}px`, height: `${height}px` }}
                    onClick={(e) => { e.stopPropagation(); handleOpenForm(selectedDate, undefined, app) }}
                  >
                    <div className="appointment-block-name">
                      {cfg.icon} {app.patients?.first_name} {app.patients?.last_name}
                    </div>
                    {height >= 30 && (
                      <div className="appointment-block-info">
                        {date.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })} • {app.duration_minutes} min
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ==========================================================================
  // RENDER: WEEK VIEW
  // ==========================================================================
  const renderWeekView = () => {
    const weekDays = getWeekDays(selectedDate)
    const hours = Array.from({length: 14}, (_, i) => i + 7)

    return (
      <div className="time-grid">
        <div className="time-grid-header">
          <div className="time-grid-header-label">HGMT-6</div>
          {weekDays.map(d => {
            const isToday = formatDateYMD(d) === formatDateYMD(new Date())
            return (
              <div key={d.toISOString()} className={`time-grid-day-header ${isToday ? 'is-today' : ''}`}>
                <div style={{ fontSize: '0.6rem', opacity: 0.8 }}>{d.toLocaleDateString('es-HN', { weekday: 'short' })}</div>
                <div style={{ fontSize: '1rem' }}>{d.getDate()}</div>
              </div>
            )
          })}
        </div>
        <div className="time-grid-body">
          <div className="time-grid-labels">
            {hours.map(h => (
              <div key={h} className="time-label">
                {h === 12 ? '12 PM' : h > 12 ? `${h-12} PM` : `${h} AM`}
              </div>
            ))}
          </div>
          <div className="time-grid-columns">
            {weekDays.map(d => {
              const dStr = formatDateYMD(d)
              const apps = appointmentsByDate[dStr] || []
              return (
                <div key={dStr} className="time-grid-column" onClick={() => handleOpenForm(d)}>
                  {hours.map(h => (
                    <div key={h} className="time-slot">
                      <div className="time-slot-half"></div>
                    </div>
                  ))}
                  
                  {apps.map(app => {
                    const date = new Date(app.scheduled_at)
                    const h = date.getHours()
                    const m = date.getMinutes()
                    if (h < 7 || h > 20) return null
                    
                    const top = ((h - 7) * 60 + m)
                    const height = app.duration_minutes || 15
                    const cfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.PENDING

                    return (
                      <div 
                        key={app.id} 
                        className={`appointment-block ${cfg.class}`}
                        style={{ top: `${top}px`, height: `${height}px` }}
                        onClick={(e) => { e.stopPropagation(); handleOpenForm(d, undefined, app) }}
                        title={`${app.patients?.first_name} ${app.patients?.last_name}`}
                      >
                        <div className="appointment-block-name" style={{ fontSize: '0.65rem' }}>
                          {app.patients?.first_name}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ==========================================================================
  // RENDER: MONTH VIEW
  // ==========================================================================
  const renderMonthView = () => {
    const year = selectedDate.getFullYear()
    const month = selectedDate.getMonth()
    const daysInMonth = getDaysInMonth(year, month)
    const firstDay = getFirstDayOfMonth(year, month)
    const todayStr = formatDateYMD(new Date())

    const cells = []
    
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="month-day-cell other-month"></div>)
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      const dStr = formatDateYMD(date)
      const apps = appointmentsByDate[dStr] || []
      const isToday = dStr === todayStr

      cells.push(
        <div key={d} className={`month-day-cell ${isToday ? 'today' : ''}`} onClick={() => { setSelectedDate(date); setViewMode('day') }}>
          <div className="month-day-number">{d}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {apps.slice(0, 3).map(app => {
              const cfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.PENDING
              const time = new Date(app.scheduled_at).toLocaleTimeString('es-HN', { hour: '2-digit', minute:'2-digit' })
              return (
                <div key={app.id} className={`month-appointment-bar ${cfg.class}`} title={`${time} - ${app.patients?.first_name} ${app.patients?.last_name}`}>
                  {time} {app.patients?.first_name}
                </div>
              )
            })}
            {apps.length > 3 && (
              <div className="month-more-label">+{apps.length - 3} más</div>
            )}
          </div>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'].map(d => (
            <div key={d} className="month-day-header">{d}</div>
          ))}
        </div>
        <div className="month-grid">
          {cells}
        </div>
      </div>
    )
  }

  // ==========================================================================
  // RENDER: AGENDA LIST VIEW
  // ==========================================================================
  const renderAgendaView = () => {
    const dStr = formatDateYMD(selectedDate)
    const apps = appointmentsByDate[dStr] || []

    if (apps.length === 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)' }}>
          <CalendarIcon size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
          <h3>No hay citas programadas</h3>
          <p>No se encontraron citas para {selectedDate.toLocaleDateString('es-HN', { dateStyle: 'long' })}.</p>
        </div>
      )
    }

    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        <h3 style={{ marginBottom: '1rem', color: '#0f172a' }}>
          Citas del {selectedDate.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h3>
        <table className="agenda-table">
          <thead>
            <tr>
              <th>Hora</th>
              <th>Paciente</th>
              <th>Duración</th>
              <th>Estado</th>
              <th>Doctor</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {apps.map(app => {
              const time = new Date(app.scheduled_at).toLocaleTimeString('es-HN', { hour: '2-digit', minute:'2-digit' })
              const doc = doctors.find(d => d.id === app.doctor_id)
              
              return (
                <tr key={app.id}>
                  <td style={{ fontWeight: 600 }}>{time}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{app.patients?.first_name} {app.patients?.last_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', gap: '0.5rem' }}>
                      {app.patients?.phone && <span><Phone size={10} style={{display:'inline'}}/> {app.patients.phone}</span>}
                    </div>
                  </td>
                  <td>{app.duration_minutes} min</td>
                  <td>
                    <StatusDropdown status={app.status} onChange={(s) => handleStatusChange(app.id, s)} />
                  </td>
                  <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    {doc ? `Dr. ${doc.first_name}` : '—'}
                  </td>
                  <td>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}
                      onClick={() => handleOpenForm(selectedDate, undefined, app)}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // ==========================================================================
  // RENDER: APPOINTMENT FORM MODAL
  // ==========================================================================
  const renderFormModal = () => {
    if (!showForm) return null
    
    const isEdit = !!editAppointment
    const defaultDate = editAppointment ? formatDateYMD(new Date(editAppointment.scheduled_at)) : formatDateYMD(selectedDate)
    const defaultTime = editAppointment ? new Date(editAppointment.scheduled_at).toTimeString().slice(0,5) : '08:00'
    
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const formData = new FormData(e.currentTarget)
      if (isEdit) {
        await updateAppointment(editAppointment.id, formData)
      } else {
        await createAppointment(formData)
      }
      setShowForm(false)
    }

    return (
      <div className="sidebar-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0 }}>{isEdit ? 'Editar Cita' : 'Nueva Cita'}</h3>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              <XCircle size={24} color="#64748b" />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Paciente</label>
              <select name="patient_id" className="form-input" required defaultValue={editAppointment?.patients?.id || ''}>
                <option value="" disabled>Seleccione un paciente</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.phone})</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Doctor asignado</label>
              <select name="doctor_id" className="form-input" required defaultValue={editAppointment?.doctor_id || currentDoctor.id}>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>Dr. {d.first_name} {d.last_name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Fecha</label>
                <input type="date" name="date" className="form-input" required defaultValue={defaultDate} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Hora</label>
                <input type="time" name="time" className="form-input" required defaultValue={defaultTime} />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Duración</label>
              <select name="duration_minutes" className="form-input" required defaultValue={editAppointment?.duration_minutes || 15}>
                {DURATIONS.map(d => <option key={d} value={d}>{d} minutos</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Notas / Motivo</label>
              <textarea name="notes" className="form-input" rows={3} defaultValue={editAppointment?.notes || ''}></textarea>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                {isEdit ? 'Guardar Cambios' : 'Agendar Cita'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // ==========================================================================
  // MAIN RENDER
  // ==========================================================================
  return (
    <div className="agenda-layout">
      {/* SIDEBAR */}
      <aside className="agenda-sidebar">
        {renderMiniCalendar()}
        
        <div style={{ marginTop: '1rem' }}>
          <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b', marginBottom: '0.5rem' }}>Filtros</h4>
          
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Doctor</label>
            <select 
              className="form-input" 
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
            >
              {currentDoctor.role === 'ASSISTANT' || currentDoctor.role === 'ADMIN' ? (
                <option value="all">Todos los doctores</option>
              ) : null}
              {doctors.map(d => (
                <option key={d.id} value={d.id}>Dr. {d.first_name} {d.last_name}</option>
              ))}
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#334155', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={includeCancelled}
              onChange={(e) => setIncludeCancelled(e.target.checked)}
            />
            Mostrar canceladas / no show
          </label>
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
          <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b', marginBottom: '0.5rem' }}>Leyenda</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Object.values(STATUS_CONFIG).map((cfg, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: '#334155' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: cfg.color, border: '1px solid rgba(0,0,0,0.1)' }}></div>
                {cfg.label}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* MAIN AREA */}
      <main className="agenda-main">
        {/* TOPBAR */}
        <div className="agenda-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem' }} onClick={handleToday}>
              Hoy
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <button className="mini-calendar-nav" onClick={handlePrev}><ChevronLeft size={18}/></button>
              <button className="mini-calendar-nav" onClick={handleNext}><ChevronRight size={18}/></button>
              <span style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', marginLeft: '0.5rem' }}>
                {selectedDate.toLocaleDateString('es-HN', { month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>
          
          <div className="view-tabs">
            {(['agenda', 'day', 'week', 'month'] as ViewMode[]).map(mode => (
              <button 
                key={mode} 
                className={`view-tab ${viewMode === mode ? 'active' : ''}`}
                onClick={() => setViewMode(mode)}
              >
                {mode === 'agenda' ? 'Lista' : mode === 'day' ? 'Día' : mode === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
        </div>

        {/* VIEW CONTENT */}
        {viewMode === 'agenda' && renderAgendaView()}
        {viewMode === 'day' && renderDayView()}
        {viewMode === 'week' && renderWeekView()}
        {viewMode === 'month' && renderMonthView()}

      </main>

      {/* FAB */}
      <button className="agenda-fab" onClick={() => handleOpenForm()}>
        <Plus size={24} />
      </button>

      {/* MODAL */}
      {renderFormModal()}
    </div>
  )
}
