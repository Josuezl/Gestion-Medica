'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { createAppointment, updateAppointmentStatus, updateAppointment } from './actions'
import { searchPatientsForAgenda } from '@/app/dashboard/patients/actions'
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
  MoreHorizontal,
  Clipboard,
  X,
  CheckCircle,
  Edit2,
  FileText,
} from 'lucide-react'
import { doctorShortName } from '@/utils/doctorName'

// ============================================================================
// TYPES
// ============================================================================
type ViewMode = 'agenda' | 'day' | 'week' | 'month'

interface Doctor {
  id: string
  first_name: string
  last_name: string
  role: string
  gender?: string | null
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
  location_id: string | null
  patients: Patient | null
}

interface Location {
  id: string
  name: string
  is_active: boolean
}

interface AgendaClientProps {
  patients: Patient[]
  initialAppointments: Appointment[]
  doctors: Doctor[]
  locations: Location[]
  defaultLocationId?: string
  currentDoctor: { id: string; role: string; isOrgAdmin?: boolean }
}

// ============================================================================
// HELPERS
// ============================================================================
const STATUS_CONFIG: Record<string, { label: string, color: string, dotColor: string, class: string }> = {
  PENDING: { label: 'Pendiente', color: '#f3f4f6', dotColor: '#9ca3af', class: 'status-pending' },
  CANCELLED: { label: 'Cancelada', color: '#fee2e2', dotColor: '#ef4444', class: 'status-cancelled' },
  CONFIRMED: { label: 'Confirmada', color: '#dcfce7', dotColor: '#22c55e', class: 'status-confirmed' },
  NO_SHOW: { label: 'No se presento', color: '#f3f4f6', dotColor: '#6b7280', class: 'status-no-show' },
  WAITING: { label: 'En Sala', color: '#fef3c7', dotColor: '#f59e0b', class: 'status-waiting' },
  IN_PROGRESS: { label: 'En consulta', color: '#dbeafe', dotColor: '#3b82f6', class: 'status-in-progress' },
  COMPLETED: { label: 'Realizada', color: '#d1fae5', dotColor: '#10b981', class: 'status-completed' },
}

const DURATIONS = [15, 30, 45, 60]

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
const getFirstDayOfMonth = (year: number, month: number) => (new Date(year, month, 1).getDay() + 6) % 7

const formatDateYMD = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const getWeekDays = (date: Date) => {
  const current = new Date(date)
  const day = current.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const first = current.getDate() + diffToMonday
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
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const current = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="status-dropdown-container" ref={dropdownRef}>
      <div 
        className="status-dropdown-trigger" 
        onClick={() => setOpen(!open)}
      >
        <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: current.dotColor, border: '1px solid rgba(0,0,0,0.1)' }}></div>
        {current.label}
      </div>
      {open && (
        <div className="status-dropdown-menu">
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <button
              key={key}
              type="button"
              className={`status-dropdown-item ${status === key ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange(key)
                setOpen(false)
              }}
            >
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: config.dotColor, border: '1px solid rgba(0,0,0,0.1)' }}></div>
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
export default function AgendaClient({ patients, initialAppointments, doctors, locations, defaultLocationId = 'all', currentDoctor }: AgendaClientProps) {
  // --- State ---
  const [viewMode, setViewMode] = useState<ViewMode>('agenda')
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const isAssistant = currentDoctor.role === 'ASSISTANT'
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(isAssistant ? 'all' : currentDoctor.id)
  // Si la cookie apunta a una clínica que ya no está en las opciones activas, caer a 'all'
  // (si no, el <select> muestra "Todas las clínicas" pero filtra por un id fantasma y oculta todo).
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    defaultLocationId === 'all' || locations.some(l => l.id === defaultLocationId) ? defaultLocationId : 'all'
  )
  
  const [showForm, setShowForm] = useState(false)
  const [selectedHourForForm, setSelectedHourForForm] = useState<string>('08:00')
  const [editAppointment, setEditAppointment] = useState<Appointment | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false)
  const [patientSearchResults, setPatientSearchResults] = useState<typeof patients>([])
  const [isSearchingPatients, setIsSearchingPatients] = useState(false)
  // Nombre escrito que no corresponde a un paciente registrado (dispara el modal de registro).
  const [unregisteredName, setUnregisteredName] = useState<string | null>(null)

  const goRegisterPatient = (name: string) => {
    window.location.href = `/dashboard/patients/new?nombre=${encodeURIComponent(name.trim())}`
  }

  // Búsqueda dinámica con debounce: llama al servidor en vez de filtrar en memoria.
  // Funciona con cualquier cantidad de pacientes (no hay límite de carga inicial).
  useEffect(() => {
    const q = patientSearch.trim()
    if (q.length < 2) {
      setPatientSearchResults([])
      return
    }
    setIsSearchingPatients(true)
    const timer = setTimeout(async () => {
      const results = await searchPatientsForAgenda(q)
      setPatientSearchResults(results as typeof patients)
      setIsSearchingPatients(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [patientSearch])
  
  // --- Derived Data ---
  const filteredAppointments = useMemo(() => {
    return initialAppointments.filter(app => {
      // Filtrar doctor
      if (selectedDoctorId !== 'all' && app.doctor_id !== selectedDoctorId) return false
      // Filtrar clínica
      if (selectedLocationId !== 'all' && app.location_id !== selectedLocationId) return false
      return true
    })
  }, [initialAppointments, selectedDoctorId, selectedLocationId])

  const appointmentsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {}
    filteredAppointments.forEach(app => {
      const dateStr = formatDateYMD(new Date(app.scheduled_at))
      if (!map[dateStr]) map[dateStr] = []
      map[dateStr].push(app)
    })
    return map
  }, [filteredAppointments])

  const timeGridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if ((viewMode === 'day' || viewMode === 'week') && timeGridRef.current) {
      let earliestMinutes = 8 * 60 // Default to 8:00 AM
      
      const checkApps = (apps: Appointment[]) => {
        apps.forEach(app => {
          const d = new Date(app.scheduled_at)
          const m = d.getHours() * 60 + d.getMinutes()
          if (m < earliestMinutes) earliestMinutes = m
        })
      }

      if (viewMode === 'day') {
        const dateStr = formatDateYMD(selectedDate)
        if (appointmentsByDate[dateStr]) checkApps(appointmentsByDate[dateStr])
      } else if (viewMode === 'week') {
        const weekDays = getWeekDays(selectedDate)
        weekDays.forEach(d => {
          const dateStr = formatDateYMD(d)
          if (appointmentsByDate[dateStr]) checkApps(appointmentsByDate[dateStr])
        })
      }

      // 1 min = 4px. Scroll to 30 mins before the first appointment.
      const scrollY = Math.max(0, (earliestMinutes - 30) * 4)
      
      setTimeout(() => {
        if (timeGridRef.current) {
          timeGridRef.current.scrollTo({ top: scrollY, behavior: 'smooth' })
        }
      }, 50)
    }
  }, [viewMode, selectedDate, appointmentsByDate])

  // --- Actions ---
  const handleStatusChange = async (appId: string, newStatus: string) => {
    await updateAppointmentStatus(appId, newStatus)
  }

  const handleOpenForm = (date?: Date, hour?: string, app?: Appointment) => {
    if (app) {
      setEditAppointment(app)
      setSelectedPatientId(app.patients?.id || '')
      setPatientSearch(app.patients ? `${app.patients.first_name} ${app.patients.last_name}` : '')
      setShowForm(true)
      return
    }
    
    setEditAppointment(null)
    setSelectedPatientId('')
    setPatientSearch('')
    if (date) setSelectedDate(date)
    if (hour) setSelectedHourForForm(hour)
    else setSelectedHourForForm('08:00')
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
          {['Lu','Ma','Mi','Ju','Vi','Sá','Do'].map(d => <div key={d} className="mini-calendar-day-header">{d}</div>)}
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
    
    const hours = Array.from({length: 24}, (_, i) => i) // 0 to 23

    return (
      <div className="time-grid" ref={timeGridRef}>
        <div className="time-grid-header">
          <div className="time-grid-header-label">HGMT-6</div>
          <div className="time-grid-day-header is-today">
            {selectedDate.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric' })}
          </div>
        </div>
        <div className="time-grid-body">
          <div className="time-grid-labels" style={{ width: '80px', minWidth: '80px' }}>
            {hours.map(h => (
              <div key={h} style={{ height: '240px', display: 'flex', flexDirection: 'column' }}>
                <div className="time-label" style={{ height: '60px' }}>{String(h).padStart(2, '0')}:00</div>
                <div className="time-label" style={{ height: '60px' }}>{String(h).padStart(2, '0')}:15</div>
                <div className="time-label" style={{ height: '60px' }}>{String(h).padStart(2, '0')}:30</div>
                <div className="time-label" style={{ height: '60px' }}>{String(h).padStart(2, '0')}:45</div>
              </div>
            ))}
          </div>
          <div className="time-grid-columns">
            <div className="time-grid-column">
              {hours.map(h => (
                <div key={h} style={{ height: '240px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ height: '60px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => handleOpenForm(selectedDate, `${String(h).padStart(2, '0')}:00`)}></div>
                  <div style={{ height: '60px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => handleOpenForm(selectedDate, `${String(h).padStart(2, '0')}:15`)}></div>
                  <div style={{ height: '60px', borderBottom: '1px dashed #e2e8f0', cursor: 'pointer' }} onClick={() => handleOpenForm(selectedDate, `${String(h).padStart(2, '0')}:30`)}></div>
                  <div style={{ height: '60px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => handleOpenForm(selectedDate, `${String(h).padStart(2, '0')}:45`)}></div>
                </div>
              ))}
              
              {apps.map(app => {
                const date = new Date(app.scheduled_at)
                const h = date.getHours()
                const m = date.getMinutes()
                
                const top = (h * 60 + m) * 4
                const height = (app.duration_minutes || 15) * 4
                const cfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.PENDING

                return (
                  <div 
                    key={app.id} 
                    className={`appointment-block ${cfg.class}`}
                    style={{ top: `${top}px`, height: `${height}px` }}
                    onClick={(e) => { e.stopPropagation(); handleOpenForm(selectedDate, undefined, app) }}
                    title={`${app.patients?.first_name} ${app.patients?.last_name}`}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', color: '#1e293b' }}>
                        <CalendarIcon size={12}/> {app.patients?.first_name?.split(' ')[0]} {app.patients?.last_name?.split(' ')[0]}
                      </div>
                      {height >= 60 && (
                        <div style={{ fontSize: '0.7rem', color: cfg.dotColor, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {cfg.label} <User size={12} color="#94a3b8"/>
                        </div>
                      )}
                    </div>
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
    const hours = Array.from({length: 24}, (_, i) => i)

    return (
      <div className="time-grid" ref={timeGridRef}>
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
          <div className="time-grid-labels" style={{ width: '80px', minWidth: '80px' }}>
            {hours.map(h => (
              <div key={h} style={{ height: '240px', display: 'flex', flexDirection: 'column' }}>
                <div className="time-label" style={{ height: '60px' }}>{String(h).padStart(2, '0')}:00</div>
                <div className="time-label" style={{ height: '60px' }}>{String(h).padStart(2, '0')}:15</div>
                <div className="time-label" style={{ height: '60px' }}>{String(h).padStart(2, '0')}:30</div>
                <div className="time-label" style={{ height: '60px' }}>{String(h).padStart(2, '0')}:45</div>
              </div>
            ))}
          </div>
          <div className="time-grid-columns">
            {weekDays.map(d => {
              const dStr = formatDateYMD(d)
              const apps = appointmentsByDate[dStr] || []
              return (
                <div key={dStr} className="time-grid-column">
                  {hours.map(h => (
                    <div key={h} style={{ height: '240px', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ height: '60px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => handleOpenForm(d, `${String(h).padStart(2, '0')}:00`)}></div>
                      <div style={{ height: '60px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => handleOpenForm(d, `${String(h).padStart(2, '0')}:15`)}></div>
                      <div style={{ height: '60px', borderBottom: '1px dashed #e2e8f0', cursor: 'pointer' }} onClick={() => handleOpenForm(d, `${String(h).padStart(2, '0')}:30`)}></div>
                      <div style={{ height: '60px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => handleOpenForm(d, `${String(h).padStart(2, '0')}:45`)}></div>
                    </div>
                  ))}
                  
                  {apps.map(app => {
                    const date = new Date(app.scheduled_at)
                    const h = date.getHours()
                    const m = date.getMinutes()
                    
                    const top = (h * 60 + m) * 4
                    const height = (app.duration_minutes || 15) * 4
                    const cfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.PENDING

                    return (
                      <div 
                        key={app.id} 
                        className={`appointment-block ${cfg.class}`}
                        style={{ top: `${top}px`, height: `${height}px` }}
                        onClick={(e) => { e.stopPropagation(); handleOpenForm(d, undefined, app) }}
                        title={`${app.patients?.first_name} ${app.patients?.last_name}`}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', color: '#1e293b' }}>
                            <CalendarIcon size={12}/> {app.patients?.first_name?.split(' ')[0]} {app.patients?.last_name?.split(' ')[0]}
                          </div>
                          {height >= 60 && (
                            <div style={{ fontSize: '0.7rem', color: cfg.dotColor, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {cfg.label} <User size={12} color="#94a3b8"/>
                            </div>
                          )}
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
                  {time} {app.patients?.first_name?.split(' ')[0]} {app.patients?.last_name?.split(' ')[0]}
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
      <div className="month-view" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <div className="month-weekdays" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map(d => (
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', backgroundColor: '#ffffff' }}>
        <h3 style={{ marginBottom: '1.5rem', color: '#0f172a', fontSize: '1.25rem', fontWeight: 700 }}>
          Citas del {selectedDate.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {apps.map(app => {
            const time = new Date(app.scheduled_at).toLocaleTimeString('es-HN', { hour: '2-digit', minute:'2-digit' })
            
            const config = STATUS_CONFIG[app.status] || STATUS_CONFIG.PENDING
            const statusColor = config.dotColor

            // Calculate age
            let ageText = ''
            if (app.patients?.birth_date) {
              const birth = new Date(app.patients.birth_date)
              const diffMs = Date.now() - birth.getTime()
              const ageDt = new Date(diffMs)
              const age = Math.abs(ageDt.getUTCFullYear() - 1970)
              ageText = `${age} años • `
            }

            return (
              <div key={app.id} className="appt-card" style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                padding: '0.75rem 1rem',
                borderLeft: `4px solid ${statusColor}`,
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                borderTop: '1px solid #e2e8f0',
                borderRight: '1px solid #e2e8f0',
                borderBottom: '1px solid #e2e8f0'
              }}>
                <div style={{ width: '95px', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, color: statusColor, fontSize: '1rem', whiteSpace: 'nowrap' }}>{time}</div>
                </div>
                
                <div className="appt-info" style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${app.patients?.first_name || ''} ${app.patients?.last_name || ''}`.trim()}>
                    {app.patients?.first_name} {app.patients?.last_name}
                  </div>
                  <div style={{ fontWeight: 500, color: '#64748b', fontSize: '0.82rem', marginTop: '0.15rem' }}>
                    {ageText}Tel: {app.patients?.phone || 'Sin teléfono'}
                  </div>
                  {app.notes && (
                    <div style={{ fontSize: '0.85rem', color: '#0d9488', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Clipboard size={14} /> {app.notes}
                    </div>
                  )}
                </div>
                
                <div className="appt-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <StatusDropdown status={app.status} onChange={(s) => handleStatusChange(app.id, s)} />
                  
                  {app.status === 'PENDING' && (
                    <button onClick={() => handleStatusChange(app.id, 'CONFIRMED')} className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem', borderRadius: '20px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', color: '#1e293b' }}>
                      <CheckCircle size={14} color="#1e293b" /> Confirmar
                    </button>
                  )}
                  
                  {app.status === 'CONFIRMED' && (
                    <button onClick={() => handleStatusChange(app.id, 'WAITING')} className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem', borderRadius: '20px', backgroundColor: '#fef3c7', color: '#d97706', border: '1px solid #fde68a' }}>
                      <User size={14} /> Llegó
                    </button>
                  )}

                  {!isAssistant && ['WAITING', 'IN_PROGRESS', 'CONFIRMED', 'PENDING'].includes(app.status) && (
                    <button onClick={() => window.location.href=`/dashboard/consultations/new?patientId=${app.patients?.id}&appointmentId=${app.id}`} className="btn btn-primary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem', borderRadius: '20px' }}>
                      <Clipboard size={14} /> Iniciar Consulta
                    </button>
                  )}

                  {app.patients?.id && (
                    <button onClick={() => window.location.href=`/dashboard/patients/${app.patients?.id}`} className="btn" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem', borderRadius: '20px', backgroundColor: '#3b82f6', border: '1px solid #3b82f6', color: '#ffffff' }} title="Abrir expediente del paciente">
                      <FileText size={14} color="#ffffff" /> Expediente
                    </button>
                  )}

                  <button onClick={() => handleOpenForm(selectedDate, undefined, app)} className="btn btn-secondary" style={{ padding: '0.4rem', borderRadius: '50%', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }} title="Editar cita">
                    <Edit2 size={16} color="#64748b" />
                  </button>

                  <button 
                    onClick={() => {
                      const doctor = doctors.find(d => d.id === app.doctor_id)
                      const docName = doctorShortName(doctor?.first_name, doctor?.last_name, doctor?.gender)
                      const dateStr = new Date(app.scheduled_at).toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })
                      const text = `Hola ${app.patients?.first_name || ''} ${app.patients?.last_name || ''}, te recordamos tu cita programada:\n\n📅 Fecha: ${dateStr}\n⏰ Hora: ${time}\n🩺 Médico: ${docName}\n\nPor favor, confírmanos tu asistencia respondiendo a este mensaje. ¡Te esperamos!`
                      const patientPhoneClean = app.patients?.phone ? app.patients.phone.replace(/\D/g, '') : ''
                      
                      const whatsappUrl = `https://api.whatsapp.com/send?phone=${patientPhoneClean}&text=${encodeURIComponent(text)}`
                      window.open(whatsappUrl, '_blank', 'noreferrer')
                    }}
                    className="btn" 
                    style={{ 
                      padding: '0.4rem', 
                      borderRadius: '50%', 
                      backgroundColor: '#dcf8c6', 
                      color: '#128C7E', 
                      border: '1px solid #bbf7d0',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }} 
                    title="Enviar recordatorio por WhatsApp"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ display: 'block' }}>
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.003 5.324 5.328 0 11.896 0c3.181.001 6.173 1.24 8.424 3.493 2.25 2.253 3.487 5.244 3.484 8.427-.004 6.578-5.329 11.902-11.897 11.902-2.003-.001-3.973-.505-5.727-1.467L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.725 1.45 5.247 0 9.518-4.268 9.52-9.51 0-2.54-1-4.927-2.817-6.724-1.815-1.8-4.223-2.79-6.733-2.792-5.253 0-9.526 4.268-9.529 9.511 0 1.63.43 3.22 1.25 4.63l-.993 3.626 3.725-.976zm11.233-6.006c-.3-.15-1.772-.875-2.047-.975-.276-.1-.477-.15-.677.15-.2.3-.777.975-.952 1.175-.176.2-.351.225-.651.075-1.204-.6-2.002-1.054-2.8-2.427-.21-.362.21-.337.6-.113.35.2.775.9.875 1.1.1.2.05.375-.025.525-.075.15-.677.8-1.002 1.175-.325.375-.65.3-.95.15-1.157-.58-1.907-1.01-2.67-2.327-.15-.257-.15-.425.075-.65.2-.2.45-.525.677-.8.225-.275.3-.475.45-.775.15-.3.075-.575-.025-.775-.1-.2-.677-1.625-.927-2.225-.244-.588-.492-.51-.677-.52l-.576-.007c-.2 0-.527.075-.803.375-.276.3-1.053 1.025-1.053 2.5 0 1.475 1.078 2.9 1.228 3.1.15.2 2.122 3.24 5.141 4.542.717.31 1.277.494 1.714.633.72.228 1.376.196 1.894.118.577-.087 1.772-.725 2.022-1.425.25-.7.25-1.3 1.75-1.425-.075-.125-.275-.2-.575-.35z" />
                    </svg>
                  </button>
                  
                  {!['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(app.status) && (
                    <button onClick={() => handleStatusChange(app.id, 'CANCELLED')} className="btn btn-secondary" style={{ padding: '0.4rem', borderRadius: '50%', backgroundColor: '#ffffff', color: '#e11d48', border: '1px solid #ffe4e6' }}>
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
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
    const defaultTime = editAppointment ? new Date(editAppointment.scheduled_at).toTimeString().slice(0,5) : selectedHourForForm

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      setFormError(null)
      setIsSubmitting(true)
      const formData = new FormData(e.currentTarget)
      
      const dateVal = formData.get('date') as string
      const timeVal = formData.get('time') as string
      const doctorIdVal = formData.get('doctor_id') as string
      const statusVal = formData.get('status') as string
      const locationVal = formData.get('location_id') as string

      // Validación: la cita debe ser para un paciente REGISTRADO (seleccionado del buscador).
      if (!selectedPatientId) {
        const typed = patientSearch.trim()
        if (typed.length === 0) {
          setFormError('Selecciona un paciente registrado para la cita.')
        } else {
          // Escribió un nombre que no eligió del listado → ofrecer registrarlo.
          setUnregisteredName(typed)
        }
        setIsSubmitting(false)
        return
      }

      // Validación: si el tenant tiene clínicas, la cita debe asignarse a una
      // (si no, queda "huérfana" y no aparece al filtrar por clínica).
      if (locations.length > 0 && !locationVal) {
        setFormError('Selecciona una clínica para la cita.')
        setIsSubmitting(false)
        return
      }

      // Validation: Rescheduling a cancelled/no-show appointment
      if (isEdit && editAppointment && ['CANCELLED', 'NO_SHOW'].includes(editAppointment.status)) {
        const oldDateStr = formatDateYMD(new Date(editAppointment.scheduled_at))
        if (dateVal > oldDateStr && ['CANCELLED', 'NO_SHOW'].includes(statusVal)) {
          setFormError('Al reprogramar una cita cancelada o no asistida para un día posterior, debes cambiar el estado a "Pendiente" o "Confirmada".')
          setIsSubmitting(false)
          return
        }
      }

      const overlapping = initialAppointments.find(app => {
        if (isEdit && app.id === editAppointment?.id) return false
        if (app.status === 'CANCELLED') return false
        if (app.doctor_id !== doctorIdVal) return false
        
        const d = new Date(app.scheduled_at)
        const appDate = formatDateYMD(d)
        const appTime = d.toTimeString().slice(0,5)
        
        return appDate === dateVal && appTime === timeVal
      })

      if (overlapping) {
        if (!window.confirm(`Ya existe una cita a las ${timeVal} para este doctor. ¿Deseas agendar de todos modos?`)) {
          setIsSubmitting(false)
          return
        }
      }
      
      let result
      if (isEdit) {
        result = await updateAppointment(editAppointment.id, formData)
      } else {
        result = await createAppointment(formData)
      }
      
      setIsSubmitting(false)
      
      if (result && result.error) {
        setFormError(result.error)
      } else {
        setShowForm(false)
      }
    }

    return (
      <div className="sidebar-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.2s ease-out forwards' }}>
        {/* Confirmación: el paciente escrito no está registrado */}
        {unregisteredName && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
            <div className="card" style={{ maxWidth: '460px', width: '100%' }}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>Paciente no registrado</h3>
              <p style={{ margin: '0 0 1.25rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                El paciente <strong>«{unregisteredName}»</strong> no está registrado. No se puede agendar
                una cita a un paciente sin registrar. ¿Deseas registrarlo ahora?
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setUnregisteredName(null)}>Cancelar</button>
                <button type="button" className="btn btn-primary" onClick={() => goRegisterPatient(unregisteredName)}>Sí, registrar</button>
              </div>
            </div>
          </div>
        )}
        <div className="card modal-card" style={{ animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards', transition: 'box-shadow 0.2s, border-color 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0 }}>{isEdit ? 'Editar Cita' : 'Nueva Cita'}</h3>
            <button onClick={() => { setShowForm(false); setFormError(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              <XCircle size={24} color="#64748b" />
            </button>
          </div>
          
          {formError && (
            <div style={{ color: '#e11d48', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: '1.4' }}>
              <strong>Nota:</strong> {formError}
            </div>
          )}
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Paciente</label>
              <input type="hidden" name="patient_id" value={selectedPatientId} />
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Buscar paciente por nombre o teléfono..."
                  value={patientSearch}
                  onChange={(e) => {
                    setPatientSearch(e.target.value)
                    setIsPatientDropdownOpen(true)
                    setSelectedPatientId('')
                  }}
                  onFocus={() => setIsPatientDropdownOpen(true)}
                  onBlur={() => setIsPatientDropdownOpen(false)}
                  required={!selectedPatientId}
                />
                {isPatientDropdownOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, maxHeight: '250px', overflowY: 'auto', marginTop: '4px', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                    {isSearchingPatients && (
                      <div style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#64748b', textAlign: 'center' }}>Buscando...</div>
                    )}
                    {!isSearchingPatients && patientSearchResults.map(p => (
                      <div 
                        key={p.id} 
                        style={{ padding: '0.5rem', cursor: 'pointer', borderRadius: '8px', backgroundColor: selectedPatientId === p.id ? 'rgba(45, 212, 191, 0.1)' : 'transparent', borderBottom: '1px solid rgba(0,0,0,0.05)' }}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSelectedPatientId(p.id)
                          setPatientSearch(`${p.first_name} ${p.last_name}`)
                          setIsPatientDropdownOpen(false)
                        }}
                      >
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{p.first_name} {p.last_name}</div>
                      </div>
                    ))}
                    {!isSearchingPatients && patientSearch.trim().length >= 2 && patientSearchResults.length === 0 && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => goRegisterPatient(patientSearch)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.6rem 0.5rem', cursor: 'pointer', borderRadius: '8px', border: '1px dashed #14b8a6', background: 'rgba(45, 212, 191, 0.08)', color: '#0d9488', fontSize: '0.85rem', fontWeight: 600, textAlign: 'left' }}
                      >
                        <Plus size={16} />
                        No se encontró. Registrar nuevo paciente «{patientSearch.trim()}»
                      </button>
                    )}
                    {!isSearchingPatients && patientSearch.trim().length < 2 && (
                      <div style={{ padding: '0.5rem', fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center' }}>Escribe al menos 2 caracteres para buscar.</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Doctor *</label>
              <select name="doctor_id" className="form-input" required defaultValue={editAppointment?.doctor_id || (selectedDoctorId !== 'all' ? selectedDoctorId : currentDoctor.id)}>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>{doctorShortName(d.first_name, d.last_name, d.gender)}</option>
                ))}
              </select>
            </div>

            {locations.length > 0 && (
              <div className="form-group">
                <label className="form-label">Clínica</label>
                <select name="location_id" className="form-input" required defaultValue={editAppointment?.location_id || (selectedLocationId !== 'all' ? selectedLocationId : (locations.length === 1 ? locations[0].id : ''))}>
                  <option value="">Selecciona una clínica</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="responsive-2col">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Fecha</label>
                <input type="date" name="date" className="form-input" required defaultValue={defaultDate} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Hora</label>
                <input type="time" name="time" className="form-input" required defaultValue={defaultTime} />
              </div>
            </div>

            <div className="responsive-2col">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Duración</label>
                <select name="duration_minutes" className="form-input" required defaultValue={editAppointment?.duration_minutes || 15}>
                  {DURATIONS.map(d => <option key={d} value={d}>{d} minutos</option>)}
                </select>
              </div>
              
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Estado</label>
                <select name="status" className="form-input" required defaultValue={editAppointment?.status || 'PENDING'}>
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Notas / Motivo</label>
              <textarea name="notes" className="form-input" rows={3} defaultValue={editAppointment?.notes || ''}></textarea>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : (isEdit ? 'Guardar Cambios' : 'Agendar Cita')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setFormError(null); }}>
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
            {/* Filter Section */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="filter-group">
                <label style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem', display: 'block', fontWeight: 500 }}>Doctor</label>
                <div style={{ position: 'relative' }}>
                  <select
                    className="form-input"
                    style={{ minWidth: '160px', width: '100%', paddingLeft: '2.5rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}
                    value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                  >
                    {currentDoctor.role === 'ASSISTANT' && <option value="all">Todos los doctores</option>}
                    {doctors.map(d => (
                      <option key={d.id} value={d.id}>{doctorShortName(d.first_name, d.last_name, d.gender)}</option>
                    ))}
                  </select>
                  <Stethoscope size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                </div>
              </div>

              {locations.length > 1 && (
                <div className="filter-group">
                  <label style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem', display: 'block', fontWeight: 500 }}>Clínica</label>
                  <div style={{ position: 'relative' }}>
                    <select
                      className="form-input"
                      style={{ minWidth: '160px', width: '100%', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}
                      value={selectedLocationId}
                      onChange={(e) => setSelectedLocationId(e.target.value)}
                    >
                      <option value="all">Todas las clínicas</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN AREA */}
      <main className="agenda-main" style={{ display: 'flex', flexDirection: 'column' }}>

        {/* TOPBAR */}
        <div className="agenda-topbar" style={{ display: 'flex', alignItems: 'center' }}>
          {/* Left: View Tabs & Add Button */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
            <div className="view-tabs">
              {(['agenda', 'day', 'week', 'month'] as ViewMode[]).map(mode => (
                <button 
                  key={mode} 
                  className={`view-tab ${viewMode === mode ? 'active' : ''}`}
                  onClick={() => setViewMode(mode)}
                >
                  {mode === 'agenda' ? 'Agenda' : mode === 'day' ? 'Día' : mode === 'week' ? 'Semana' : 'Mes'}
                </button>
              ))}
              <button 
                style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  backgroundColor: '#0d9488',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0 1rem',
                  cursor: 'pointer',
                  transition: 'opacity 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
                onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                onClick={() => handleOpenForm(selectedDate, undefined, undefined)}
                title="Nueva Cita"
              >
                <Plus size={20} strokeWidth={3} />
              </button>
            </div>
          </div>
          
          {/* Center: Date Nav */}
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
          
          {/* Right: Empty spacer for centering */}
          <div style={{ flex: 1 }}></div>
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
