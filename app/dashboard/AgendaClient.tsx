'use client'

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { createAppointment, updateAppointmentStatus, updateAppointment, deleteAppointment, getPatientAppointmentHistory, getAppointmentsForRange, getAppointmentById } from './actions'
import { searchPatientsForAgenda } from '@/app/dashboard/patients/actions'
import {
  Calendar as CalendarIcon,
  User,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  XCircle,
  Stethoscope,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { doctorShortName } from '@/utils/doctorName'
import { ymdHN, hm24HN, minutesOfDayHN } from '@/utils/datetime'
import { canDoClinical, canEnterVitals } from '@/utils/permissions'
import { isCreatableAppointmentStatus } from '@/utils/validation'
import { STATUS_CONFIG } from './StatusDropdown'
import PreclinicalVitalsModal from './components/PreclinicalVitalsModal'
import AppointmentCard from './components/AppointmentCard'
import { useRealtimePreclinical } from '@/utils/useRealtimePreclinical'
import { PRECLINICAL_FALLBACK_MS } from '@/utils/preclinicalMerge'
import { useRealtimeAppointments } from '@/utils/useRealtimeAppointments'
import { classifyEvent, patchAppointment, mergeLiveAppointments, isWithinLoadedWindow, type AppointmentEventRow } from '@/utils/appointmentSync'

// ============================================================================
// TYPES
// ============================================================================
type ViewMode = 'agenda' | 'day' | 'week' | 'month'

export interface Doctor {
  id: string
  first_name: string
  last_name: string
  role: string
  gender?: string | null
}

export interface Patient {
  id: string
  first_name: string
  last_name: string
  phone: string
  birth_date?: string
  gender?: string
  id_card?: string
  is_pediatric?: boolean | null
  // Pacientes migrados sin fecha de nacimiento confiable ('unknown' dispara el aviso del formulario).
  dob_status?: string | null
}

export interface Appointment {
  id: string
  scheduled_at: string
  status: string
  notes: string | null
  duration_minutes: number
  doctor_id: string
  location_id: string | null
  patients: Patient | null
  // Solicitud del portal público vinculada (solo citas PENDING_REVIEW; join uno-a-muchos).
  booking_requests?: {
    id: string
    status: string
    submitted_first_name: string
    submitted_last_name: string
    submitted_phone: string | null
  }[]
}

interface Location {
  id: string
  name: string
  is_active: boolean
}

interface AgendaClientProps {
  initialAppointments: Appointment[]
  /** Ventana [inicio, fin] que cubre initialAppointments; fuera de ella se pide el mes al servidor. */
  loadedRangeStart: string
  loadedRangeEnd: string
  doctors: Doctor[]
  locations: Location[]
  defaultLocationId?: string
  preclinicalPatientIds?: string[]
  preSelectedPatient?: { id: string; name: string } | null
  autoOpenAppointment?: boolean
  currentDoctor: { id: string; role: string; isOrgAdmin?: boolean }
}

// ============================================================================
// HELPERS
// ============================================================================
const DURATIONS = [15, 30, 45, 60]

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
const getFirstDayOfMonth = (year: number, month: number) => (new Date(year, month, 1).getDay() + 6) % 7

// `formatDateYMD` es SOLO para objetos Date que representan un DÍA CALENDARIO de la UI
// (selectedDate, celdas del calendario, días de la semana): construidos con `new Date(y, m, d)`
// locales, hacen round-trip a su propio Y/M/D en cualquier zona horaria. NUNCA pasar aquí un
// instante `new Date(scheduled_at)`: para eso va `ymdHN` (día de Honduras del instante).
const formatDateYMD = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Día de HOY en Honduras como Date calendario local (para usar con formatDateYMD/navegación).
// Igual en servidor y navegador: evita que "hoy" caiga en distinto día por la zona del runtime.
const hoyHNCalendario = () => {
  const [y, m, d] = ymdHN(new Date()).split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Clave "YYYY-MM" y rango [inicio de mes, inicio del mes siguiente) para la caché de meses
// fuera de la ventana inicial (P0-1).
const monthKeyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const monthRangeOf = (key: string): [Date, Date] => {
  const [y, m] = key.split('-').map(Number)
  return [new Date(y, m - 1, 1), new Date(y, m, 1)]
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
// MAIN COMPONENT
// ============================================================================
export default function AgendaClient({ initialAppointments, loadedRangeStart, loadedRangeEnd, doctors, locations, defaultLocationId = 'all', preclinicalPatientIds = [], preSelectedPatient = null, autoOpenAppointment = false, currentDoctor }: AgendaClientProps) {
  // --- State ---
  const [viewMode, setViewMode] = useState<ViewMode>('agenda')
  // Se inicializa al día de HOY en Honduras (no la fecha local del runtime) para que el render
  // del servidor y el del navegador coincidan y no "parpadeen" citas en el día equivocado.
  const [selectedDate, setSelectedDate] = useState<Date>(hoyHNCalendario)
  // Personal clínico (médico/admin) ve su propia agenda por defecto; el de apoyo (asistente/enfermera)
  // ve la de todos. Solo el clínico inicia consultas; el clínico y la enfermera toman signos.
  const isClinician = canDoClinical(currentDoctor.role)
  const canTakeVitals = canEnterVitals(currentDoctor.role)
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(isClinician ? currentDoctor.id : 'all')
  // Pacientes con pre-clínica pendiente de hoy (badge "Signos listos") y paciente del modal de signos.
  const router = useRouter()
  // Los ids del servidor son la foto al cargar; Realtime los corrige en vivo (true = signos
  // listos, false = ya consumidos por una consulta). Se mantienen aparte de los props para que
  // un router.refresh() posterior siga mandando sobre su propia lista.
  const [livePreclinical, setLivePreclinical] = useState<Map<string, boolean>>(new Map())
  const preclinicalSet = useMemo(() => {
    const ids = new Set(preclinicalPatientIds)
    for (const [patientId, isReady] of livePreclinical) {
      if (isReady) ids.add(patientId)
      else ids.delete(patientId)
    }
    return ids
  }, [preclinicalPatientIds, livePreclinical])

  // Los signos que registra la asistente llegan por WebSocket directo a Supabase (sin pasar por
  // Vercel) y el badge se actualiza con el propio payload: cero llamadas al servidor.
  const { isLive: isPreclinicalLive } = useRealtimePreclinical({
    onChange: (row) => {
      if (!row.patient_id) return
      const patientId = row.patient_id
      setLivePreclinical((prev) => new Map(prev).set(patientId, !row.consumed_at))
    },
  })

  const [vitalsModalPatient, setVitalsModalPatient] = useState<{ patient: Patient; appointmentId: string | null } | null>(null)
  // Si la cookie apunta a una clínica que ya no está en las opciones activas, caer a 'all'
  // (si no, el <select> muestra "Todas las clínicas" pero filtra por un id fantasma y oculta todo).
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    defaultLocationId === 'all' || locations.some(l => l.id === defaultLocationId) ? defaultLocationId : 'all'
  )
  
  // Al venir de "Registrar Paciente" → "Sí, agendar cita": el modal arranca abierto con el paciente ya seleccionado.
  const autoOpen = autoOpenAppointment && !!preSelectedPatient?.id
  const [showForm, setShowForm] = useState(autoOpen)
  const [selectedHourForForm, setSelectedHourForForm] = useState<string>('08:00')
  const [editAppointment, setEditAppointment] = useState<Appointment | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [patientSearch, setPatientSearch] = useState(autoOpen ? preSelectedPatient!.name : '')
  const [selectedPatientId, setSelectedPatientId] = useState(autoOpen ? preSelectedPatient!.id : '')
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false)
  const [patientSearchResults, setPatientSearchResults] = useState<Patient[]>([])
  // Query cuyos resultados ya llegaron del servidor; "buscando" se deriva de compararla con la actual.
  const [loadedPatientQuery, setLoadedPatientQuery] = useState('')
  const patientQuery = patientSearch.trim()
  const isSearchingPatients = patientQuery.length >= 2 && loadedPatientQuery !== patientQuery
  const visiblePatientResults = patientQuery.length >= 2 && loadedPatientQuery === patientQuery ? patientSearchResults : []
  // Nombre escrito que no corresponde a un paciente registrado (dispara el modal de registro).
  const [unregisteredName, setUnregisteredName] = useState<string | null>(null)

  // --- Búsqueda de historial de citas por paciente (buscador del topbar) ---
  // Independiente del selector del modal de cita para no pisar su estado. Al elegir un
  // paciente se entra en "modo historial": el contenido muestra TODAS sus citas (pasadas
  // y futuras, de cualquier médico) en vez de las vistas Agenda/Día/Semana/Mes.
  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null)
  const [historyAppointments, setHistoryAppointments] = useState<Appointment[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [historyResults, setHistoryResults] = useState<Patient[]>([])
  const [loadedHistoryQuery, setLoadedHistoryQuery] = useState('')
  const historyQuery = historySearch.trim()
  const isSearchingHistory = historyQuery.length >= 2 && loadedHistoryQuery !== historyQuery
  const visibleHistoryResults = historyQuery.length >= 2 && loadedHistoryQuery === historyQuery ? historyResults : []
  const [isHistoryDropdownOpen, setIsHistoryDropdownOpen] = useState(false)

  // Cita que se intentó marcar "Realizada" sin consulta registrada → dispara el modal de bloqueo.
  const [completeBlocked, setCompleteBlocked] = useState<Appointment | null>(null)

  // --- Sincronización en vivo de citas (Realtime) ---
  // Overlay de citas en vivo (Realtime): nuevas/cambiadas sobrescriben por id; canceladas se excluyen.
  const [liveAppointments, setLiveAppointments] = useState<Map<string, Appointment>>(new Map())
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  // Ids con resaltado temporal (recién llegadas/cambiadas) y en desvanecido (por cancelar).
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set())
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set())

  // --- Citas fuera de la ventana inicial (P0-1) ---
  // La página solo precarga [loadedRangeStart, loadedRangeEnd]. Al navegar a un mes no cubierto
  // se pide ese mes al servidor y se cachea por clave "YYYY-MM". Tras una mutación se vacía la
  // caché (los meses dentro de la ventana los refresca el propio RSC vía revalidatePath).
  const [extraByMonth, setExtraByMonth] = useState<Record<string, Appointment[]>>({})
  const monthsPendingRef = useRef<Set<string>>(new Set())
  const invalidateExtra = () => setExtraByMonth({})

  const neededMonths = useMemo(() => {
    const dates: Date[] = viewMode === 'week' ? getWeekDays(selectedDate) : [selectedDate]
    return [...new Set(dates.map(monthKeyOf))]
  }, [viewMode, selectedDate])

  useEffect(() => {
    const windowStartMs = new Date(loadedRangeStart).getTime()
    const windowEndMs = new Date(loadedRangeEnd).getTime()
    neededMonths.forEach(key => {
      if (extraByMonth[key] || monthsPendingRef.current.has(key)) return
      const [start, end] = monthRangeOf(key)
      // Mes totalmente cubierto por la ventana inicial: no hay nada que pedir.
      if (start.getTime() >= windowStartMs && end.getTime() <= windowEndMs) return
      monthsPendingRef.current.add(key)
      getAppointmentsForRange(start.toISOString(), end.toISOString())
        .then(data => setExtraByMonth(prev => ({ ...prev, [key]: data as unknown as Appointment[] })))
        .finally(() => monthsPendingRef.current.delete(key))
    })
  }, [neededMonths, extraByMonth, loadedRangeStart, loadedRangeEnd])

  // Ventana inicial + meses cargados bajo demanda, sin duplicados (la ventana manda: viene
  // fresca del servidor tras cada revalidatePath).
  const allAppointments = useMemo(() => {
    const extra = Object.values(extraByMonth).flat()
    const seen = new Set(initialAppointments.map(a => a.id))
    const base = extra.length === 0
      ? initialAppointments
      : [...initialAppointments, ...extra.filter(a => !seen.has(a.id))]
    return mergeLiveAppointments(base, liveAppointments, removedIds)
  }, [initialAppointments, extraByMonth, liveAppointments, removedIds])

  // Ids de citas actualmente en memoria (base + live), para decidir patch vs fetch sin red.
  const knownIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => { knownIdsRef.current = new Set(allAppointments.map(a => a.id)) }, [allAppointments])

  // Meses cargados bajo demanda (para la relevancia por ventana).
  const loadedMonthKeys = useMemo(() => Object.keys(extraByMonth), [extraByMonth])

  // Cola de ids a traer del servidor, agrupados ~400 ms para no disparar N fetches en una ráfaga.
  const fetchQueueRef = useRef<Set<string>>(new Set())
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Timers de resaltado (3s) y desvanecido (600ms) por id: un evento posterior para el mismo id
  // debe poder cancelar/reiniciar el timer previo (si no, una carrera puede pisar un dato fresco
  // con un timeout viejo, o cortar el resaltado antes de tiempo ante cambios seguidos).
  const highlightTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const fadeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const cancelFade = useCallback((id: string) => {
    const t = fadeTimersRef.current.get(id)
    if (!t) return
    clearTimeout(t)
    fadeTimersRef.current.delete(id)
  }, [])

  const flashHighlight = useCallback((id: string) => {
    const prevTimer = highlightTimersRef.current.get(id)
    if (prevTimer) clearTimeout(prevTimer)
    setHighlightIds(prev => new Set(prev).add(id))
    const timer = setTimeout(() => {
      highlightTimersRef.current.delete(id)
      setHighlightIds(prev => { const n = new Set(prev); n.delete(id); return n })
    }, 3000)
    highlightTimersRef.current.set(id, timer)
  }, [])

  const drainFetchQueue = useCallback(() => {
    const ids = Array.from(fetchQueueRef.current)
    fetchQueueRef.current = new Set()
    ids.forEach(async (id) => {
      const appt = await getAppointmentById(id)
      if (!appt) return
      const a = appt as unknown as Appointment
      // Un fetch resuelve la cita como vigente: si había un remove/fade pendiente para este id
      // (p. ej. salió y volvió a entrar a la ventana), se cancela para que no la oculte después.
      cancelFade(a.id)
      setFadingIds(prev => { if (!prev.has(a.id)) return prev; const n = new Set(prev); n.delete(a.id); return n })
      setRemovedIds(prev => { if (!prev.has(a.id)) return prev; const n = new Set(prev); n.delete(a.id); return n })
      setLiveAppointments(prev => new Map(prev).set(a.id, a))
      flashHighlight(a.id)
    })
  }, [flashHighlight, cancelFade])

  const queueFetch = useCallback((id: string) => {
    fetchQueueRef.current.add(id)
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current)
    fetchTimerRef.current = setTimeout(drainFetchQueue, 400)
  }, [drainFetchQueue])

  // Limpieza de timers locales al desmontar (la suscripción Realtime ya se limpia en el hook).
  // Los Maps de timers se capturan en variables locales al montar: son el mismo objeto durante
  // toda la vida del componente (solo se mutan, nunca se reasignan), así que leerlos aquí en vez
  // de vía `.current` en el cleanup evita la advertencia de "ref value may have changed".
  useEffect(() => {
    const highlightTimers = highlightTimersRef.current
    const fadeTimers = fadeTimersRef.current
    return () => {
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current)
      highlightTimers.forEach(t => clearTimeout(t))
      highlightTimers.clear()
      fadeTimers.forEach(t => clearTimeout(t))
      fadeTimers.clear()
    }
  }, [])

  const { isLive: isAppointmentsLive } = useRealtimeAppointments({
    onEvent: (eventType, row: AppointmentEventRow) => {
      const action = classifyEvent(eventType, row, {
        knownIds: knownIdsRef.current,
        isRelevant: (at) => isWithinLoadedWindow(at, loadedRangeStart, loadedRangeEnd, loadedMonthKeys),
      })
      if (action.type === 'ignore') return
      if (action.type === 'fetch') { queueFetch(action.id); return }
      if (action.type === 'patch') {
        const existing = allAppointments.find(a => a.id === action.id)
        if (!existing) { queueFetch(action.id); return }
        // Un patch también resuelve la cita como vigente: cancela un remove/fade pendiente del
        // mismo id (reprogramada de vuelta a la ventana antes de que el fade viejo disparara).
        cancelFade(action.id)
        setFadingIds(prev => { if (!prev.has(action.id)) return prev; const n = new Set(prev); n.delete(action.id); return n })
        setLiveAppointments(prev => new Map(prev).set(action.id, patchAppointment(existing, action.row)))
        flashHighlight(action.id)
        return
      }
      if (action.type === 'remove') {
        // Desvanecer y luego quitar (600 ms coincide con la animación CSS). Timer por id: si ya
        // había uno pendiente para este id se cancela antes de programar el nuevo.
        cancelFade(action.id)
        setFadingIds(prev => new Set(prev).add(action.id))
        const timer = setTimeout(() => {
          fadeTimersRef.current.delete(action.id)
          setFadingIds(prev => { const n = new Set(prev); n.delete(action.id); return n })
          setRemovedIds(prev => new Set(prev).add(action.id))
          setLiveAppointments(prev => { if (!prev.has(action.id)) return prev; const n = new Map(prev); n.delete(action.id); return n })
        }, 600)
        fadeTimersRef.current.set(action.id, timer)
      }
    },
  })

  // Respaldo unificado: si algún canal está caído, al volver a la pestaña se recarga una vez.
  // Con ambos canales sanos no se hace nada, para no gastar una invocación en algo que Realtime ya entregó.
  useEffect(() => {
    let lastCheck = 0
    const onBack = () => {
      if (document.visibilityState !== 'visible') return
      if (isPreclinicalLive() && isAppointmentsLive()) return
      if (Date.now() - lastCheck < PRECLINICAL_FALLBACK_MS) return
      lastCheck = Date.now()
      router.refresh()
    }
    document.addEventListener('visibilitychange', onBack)
    window.addEventListener('focus', onBack)
    return () => {
      document.removeEventListener('visibilitychange', onBack)
      window.removeEventListener('focus', onBack)
    }
  }, [isPreclinicalLive, isAppointmentsLive, router])

  const goRegisterPatient = (name: string) => {
    window.location.href = `/dashboard/patients/new?nombre=${encodeURIComponent(name.trim())}`
  }

  // Búsqueda dinámica con debounce: llama al servidor en vez de filtrar en memoria.
  // Funciona con cualquier cantidad de pacientes (no hay límite de carga inicial).
  useEffect(() => {
    const q = patientSearch.trim()
    if (q.length < 2) return
    const timer = setTimeout(async () => {
      const results = await searchPatientsForAgenda(q)
      setPatientSearchResults(results as Patient[])
      setLoadedPatientQuery(q)
    }, 300)
    return () => clearTimeout(timer)
  }, [patientSearch])

  // Búsqueda de pacientes para el historial (mismo debounce/Server Action que el selector de citas).
  useEffect(() => {
    const q = historySearch.trim()
    if (q.length < 2) return
    const timer = setTimeout(async () => {
      const results = await searchPatientsForAgenda(q)
      setHistoryResults(results as Patient[])
      setLoadedHistoryQuery(q)
    }, 300)
    return () => clearTimeout(timer)
  }, [historySearch])

  // Carga (o recarga) las citas del paciente seleccionado en el historial.
  const reloadHistory = async (patientId: string) => {
    setIsLoadingHistory(true)
    const data = await getPatientAppointmentHistory(patientId)
    setHistoryAppointments(data as unknown as Appointment[])
    setIsLoadingHistory(false)
  }

  // Entrar al modo historial con un paciente; salir y volver a la agenda normal.
  const openHistory = (p: Patient) => {
    setHistoryPatient(p)
    setIsHistoryDropdownOpen(false)
    setHistorySearch(`${p.first_name} ${p.last_name}`)
    reloadHistory(p.id)
  }
  const closeHistory = () => {
    setHistoryPatient(null)
    setHistorySearch('')
    setHistoryResults([])
    setHistoryAppointments([])
  }

  // --- Derived Data ---
  // Las citas del portal público llegan con patients=null hasta que se aprueban: se sintetiza
  // una ficha de display con el nombre/teléfono enviados para que TODAS las vistas lo muestren.
  // El id vacío desactiva solo expediente/preclínica (requieren ficha real).
  const normalizedAppointments = useMemo(() => allAppointments.map(app => {
    if (app.patients || app.status !== 'PENDING_REVIEW') return app
    const req = app.booking_requests?.[0]
    if (!req) return app
    return {
      ...app,
      patients: { id: '', first_name: req.submitted_first_name, last_name: req.submitted_last_name, phone: req.submitted_phone || '' },
    }
  }), [allAppointments])

  const filteredAppointments = useMemo(() => {
    return normalizedAppointments.filter(app => {
      // Filtrar doctor
      if (selectedDoctorId !== 'all' && app.doctor_id !== selectedDoctorId) return false
      // Filtrar clínica
      if (selectedLocationId !== 'all' && app.location_id !== selectedLocationId) return false
      return true
    })
  }, [normalizedAppointments, selectedDoctorId, selectedLocationId])

  const appointmentsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {}
    filteredAppointments.forEach(app => {
      const dateStr = ymdHN(app.scheduled_at) // día de Honduras del instante (estable server/cliente)
      if (!map[dateStr]) map[dateStr] = []
      map[dateStr].push(app)
    })
    // El overlay en vivo (mergeLiveAppointments) preserva el orden de inserción, no la hora: una
    // cita nueva o reprogramada por Realtime puede llegar al final de su día. Se reordena aquí,
    // en la única salida que consumen las vistas, para que todas queden por scheduled_at asc.
    for (const dateStr of Object.keys(map)) {
      map[dateStr].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    }
    return map
  }, [filteredAppointments])

  const timeGridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if ((viewMode === 'day' || viewMode === 'week') && timeGridRef.current) {
      let earliestMinutes = 8 * 60 // Default to 8:00 AM
      
      const checkApps = (apps: Appointment[]) => {
        apps.forEach(app => {
          const m = minutesOfDayHN(app.scheduled_at) // minutos desde medianoche en hora de Honduras
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
  const handleStatusChange = async (app: Appointment, newStatus: string) => {
    const res = await updateAppointmentStatus(app.id, newStatus)
    // No se puede marcar "Realizada" sin consulta: el servidor no aplica el cambio y avisa.
    if (res && (res as { needsConsultation?: boolean }).needsConsultation) {
      setCompleteBlocked(app)
      return
    }
    // En modo historial la lista vive en estado propio: recargar para reflejar el cambio.
    if (historyPatient) reloadHistory(historyPatient.id)
    invalidateExtra()
  }

  const handleDeleteAppointment = async (app: Appointment) => {
    const name = `${app.patients?.first_name || ''} ${app.patients?.last_name || ''}`.trim() || 'este paciente'
    if (!window.confirm(`¿Estás seguro que quieres eliminar esta cita programada de ${name}? Esta acción no se puede deshacer.`)) return
    const res = await deleteAppointment(app.id)
    if (res?.error) { alert(res.error); return }
    if (historyPatient) reloadHistory(historyPatient.id)
    invalidateExtra()
    router.refresh()
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
    const todayStr = ymdHN(new Date()) // "hoy" en Honduras, estable server/cliente
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
                const top = minutesOfDayHN(app.scheduled_at) * 4 // posición en hora de Honduras
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
            const isToday = formatDateYMD(d) === ymdHN(new Date())
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
                    const top = minutesOfDayHN(app.scheduled_at) * 4 // posición en hora de Honduras
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
    const todayStr = ymdHN(new Date()) // "hoy" en Honduras, estable server/cliente

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
              const time = hm24HN(app.scheduled_at) // hora de Honduras, estable server/cliente
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
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {apps.map(app => (
            <AppointmentCard
              key={app.id}
              app={app}
              doctors={doctors}
              isClinician={isClinician}
              canTakeVitals={canTakeVitals}
              isPreclinicalReady={!!app.patients?.id && preclinicalSet.has(app.patients.id)}
              onStatusChange={(s) => handleStatusChange(app, s)}
              onEdit={() => handleOpenForm(selectedDate, undefined, app)}
              onDelete={() => handleDeleteAppointment(app)}
              onTakeVitals={() => { if (app.patients) setVitalsModalPatient({ patient: app.patients, appointmentId: app.id }) }}
              highlightClass={highlightIds.has(app.id) ? 'appt-card-flash' : fadingIds.has(app.id) ? 'appt-card-fading' : ''}
            />
          ))}
        </div>
      </div>
    )
  }

  // ==========================================================================
  // RENDER: PATIENT APPOINTMENT HISTORY VIEW
  // ==========================================================================
  // Muestra TODAS las citas del paciente seleccionado (cualquier médico, cualquier clínica),
  // separadas en "Próximas citas" (hoy en adelante, la más cercana arriba) y "Citas pasadas"
  // (la más reciente primero). Reutiliza AppointmentCard tal cual; como la tarjeta solo muestra
  // la hora, agrupamos por fecha con un subtítulo por día.
  const renderHistoryView = () => {
    if (!historyPatient) return null
    const fullName = `${historyPatient.first_name} ${historyPatient.last_name}`.trim()

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const upcoming = historyAppointments
      .filter(a => new Date(a.scheduled_at) >= startOfToday)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    const past = historyAppointments
      .filter(a => new Date(a.scheduled_at) < startOfToday)
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())

    // Agrupa citas (ya ordenadas) por día, conservando el orden de entrada.
    const groupByDate = (apps: Appointment[]) => {
      const groups: { key: string; label: string; items: Appointment[] }[] = []
      apps.forEach(app => {
        const d = new Date(app.scheduled_at)
        const key = ymdHN(app.scheduled_at) // día de Honduras del instante
        let g = groups.find(x => x.key === key)
        if (!g) {
          g = { key, label: d.toLocaleDateString('es-HN', { timeZone: 'America/Tegucigalpa', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), items: [] }
          groups.push(g)
        }
        g.items.push(app)
      })
      return groups
    }

    const renderCards = (apps: Appointment[]) => groupByDate(apps).map(g => (
      <div key={g.key} style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', textTransform: 'capitalize', margin: '0 0 0.5rem' }}>{g.label}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {g.items.map(app => (
            <AppointmentCard
              key={app.id}
              app={app}
              doctors={doctors}
              isClinician={isClinician}
              canTakeVitals={canTakeVitals}
              isPreclinicalReady={!!app.patients?.id && preclinicalSet.has(app.patients.id)}
              onStatusChange={(s) => handleStatusChange(app, s)}
              onEdit={() => handleOpenForm(undefined, undefined, app)}
              onDelete={() => handleDeleteAppointment(app)}
              onTakeVitals={() => { if (app.patients) setVitalsModalPatient({ patient: app.patients, appointmentId: app.id }) }}
            />
          ))}
        </div>
      </div>
    ))

    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', backgroundColor: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.25rem', fontWeight: 700 }}>
            Citas de {fullName}
          </h3>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem' }} onClick={closeHistory}>
            ← Volver a la agenda
          </button>
        </div>

        {isLoadingHistory ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando citas…</div>
        ) : historyAppointments.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', padding: '2rem' }}>
            <CalendarIcon size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
            <h3>Sin citas registradas</h3>
            <p>Este paciente no tiene citas registradas.</p>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <section style={{ marginBottom: '2rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#0d9488', marginBottom: '0.75rem' }}>
                  Próximas citas ({upcoming.length})
                </div>
                {renderCards(upcoming)}
              </section>
            )}
            {past.length > 0 && (
              <section>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b', marginBottom: '0.75rem' }}>
                  Citas pasadas ({past.length})
                </div>
                {renderCards(past)}
              </section>
            )}
          </>
        )}
      </div>
    )
  }

  // ==========================================================================
  // RENDER: APPOINTMENT FORM MODAL
  // ==========================================================================
  const renderFormModal = () => {
    if (!showForm) return null
    
    const isEdit = !!editAppointment
    // Los inputs del formulario son hora de pared de Honduras (la acción guarda con `-06:00`),
    // así que los defaults de edición se derivan en hora de Honduras, no la local del runtime.
    const defaultDate = editAppointment ? ymdHN(editAppointment.scheduled_at) : formatDateYMD(selectedDate)
    const defaultTime = editAppointment ? hm24HN(editAppointment.scheduled_at) : selectedHourForForm

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
        const oldDateStr = ymdHN(editAppointment.scheduled_at) // día de Honduras (vs dateVal del form)
        if (dateVal > oldDateStr && ['CANCELLED', 'NO_SHOW'].includes(statusVal)) {
          setFormError('Al reprogramar una cita cancelada o no asistida para un día posterior, debes cambiar el estado a "Pendiente" o "Confirmada".')
          setIsSubmitting(false)
          return
        }
      }

      const overlapping = allAppointments.find(app => {
        if (isEdit && app.id === editAppointment?.id) return false
        if (app.status === 'CANCELLED') return false
        if (app.doctor_id !== doctorIdVal) return false
        
        // Comparar en hora de Honduras contra los valores del formulario (que también lo son).
        const appDate = ymdHN(app.scheduled_at)
        const appTime = hm24HN(app.scheduled_at)

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
        // Si editamos/creamos una cita desde el modo historial, recargar la lista del paciente.
        if (historyPatient) reloadHistory(historyPatient.id)
        invalidateExtra()
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
                    {!isSearchingPatients && visiblePatientResults.map(p => (
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
                    {!isSearchingPatients && patientSearch.trim().length >= 2 && visiblePatientResults.length === 0 && (
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

            {(() => {
              const sel = patientSearchResults.find(p => p.id === selectedPatientId)
              return sel && sel.dob_status === 'unknown' ? (
                <div style={{ padding: '0.6rem 0.75rem', borderRadius: '10px', background: 'rgba(180, 83, 9, 0.08)', border: '1px solid rgba(180, 83, 9, 0.35)', color: '#b45309', fontSize: '0.82rem', fontWeight: 600 }}>
                  ⚠️ Este paciente no tiene fecha de nacimiento registrada. Actualízala con urgencia: afecta el cálculo de edad y de dosis.
                </div>
              ) : null
            })()}

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
                  {/* Al crear solo se ofrecen estados previos/en curso; al editar, todos. */}
                  {Object.entries(STATUS_CONFIG)
                    .filter(([key]) => isEdit || isCreatableAppointmentStatus(key))
                    .map(([key, cfg]) => (
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
                    {!isClinician && <option value="all">Todos los doctores</option>}
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
        <div className="agenda-topbar" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          {/* Left: View Tabs & Add Button */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
            <div className="view-tabs">
              {(['agenda', 'day', 'week', 'month'] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  className={`view-tab ${historyPatient ? '' : (viewMode === mode ? 'active' : '')}`}
                  onClick={() => { setViewMode(mode); closeHistory() }}
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
                {(() => {
                  // Agenda/Día: fecha completa con día de la semana ("Sábado, 27 de junio de 2026").
                  // Semana/Mes: solo mes y año (un día puntual sería engañoso).
                  const opts: Intl.DateTimeFormatOptions = (viewMode === 'agenda' || viewMode === 'day')
                    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
                    : { month: 'long', year: 'numeric' }
                  const label = selectedDate.toLocaleDateString('es-HN', opts)
                  return label.charAt(0).toUpperCase() + label.slice(1)
                })()}
              </span>
            </div>
          </div>
          
          {/* Right: Buscador de historial de citas por paciente (cualquier médico, pasado y futuro) */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
              {historyPatient ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.6rem', backgroundColor: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: '8px' }}>
                  <Search size={16} color="#0e7490" />
                  <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600, color: '#0e7490', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {historyPatient.first_name} {historyPatient.last_name}
                  </span>
                  <button onClick={closeHistory} title="Salir del historial" aria-label="Salir del historial" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
                    <XCircle size={18} color="#0e7490" />
                  </button>
                </div>
              ) : (
                <>
                  <Search size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    className="form-input"
                    style={{ width: '100%', paddingLeft: '2.25rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}
                    placeholder="Historial de citas de un paciente…"
                    value={historySearch}
                    onChange={(e) => { setHistorySearch(e.target.value); setIsHistoryDropdownOpen(true) }}
                    onFocus={() => setIsHistoryDropdownOpen(true)}
                    onBlur={() => setIsHistoryDropdownOpen(false)}
                  />
                  {isHistoryDropdownOpen && historySearch.trim().length >= 1 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, maxHeight: '320px', overflowY: 'auto', marginTop: '4px', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                      {isSearchingHistory && (
                        <div style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#64748b', textAlign: 'center' }}>Buscando...</div>
                      )}
                      {!isSearchingHistory && visibleHistoryResults.map(p => (
                        <div
                          key={p.id}
                          style={{ padding: '0.5rem', cursor: 'pointer', borderRadius: '8px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => openHistory(p)}
                        >
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>{p.first_name} {p.last_name}</div>
                          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            {p.phone || 'Sin teléfono'}{p.id_card ? ` · ${p.id_card}` : ''}
                          </div>
                        </div>
                      ))}
                      {!isSearchingHistory && historySearch.trim().length >= 2 && visibleHistoryResults.length === 0 && (
                        <div style={{ padding: '0.5rem', fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center' }}>No se encontraron pacientes.</div>
                      )}
                      {!isSearchingHistory && historySearch.trim().length < 2 && (
                        <div style={{ padding: '0.5rem', fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center' }}>Escribe al menos 2 caracteres para buscar.</div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* VIEW CONTENT — el modo historial reemplaza las vistas de calendario */}
        {historyPatient ? renderHistoryView() : (
          <>
            {viewMode === 'agenda' && renderAgendaView()}
            {viewMode === 'day' && renderDayView()}
            {viewMode === 'week' && renderWeekView()}
            {viewMode === 'month' && renderMonthView()}
          </>
        )}

      </main>

      {/* FAB */}
      <button className="agenda-fab" onClick={() => handleOpenForm()}>
        <Plus size={24} />
      </button>

      {/* MODAL */}
      {renderFormModal()}

      {/* MODAL: pre-clínica (signos vitales) */}
      {vitalsModalPatient && (
        <PreclinicalVitalsModal
          patient={vitalsModalPatient.patient}
          appointmentId={vitalsModalPatient.appointmentId}
          onClose={() => setVitalsModalPatient(null)}
          onSaved={() => router.refresh()}
        />
      )}

      {/* MODAL: bloqueo al marcar "Realizada" sin consulta registrada */}
      {completeBlocked && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 250, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '480px', width: '100%' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>Esta cita no tiene consulta registrada</h3>
            <p style={{ margin: '0 0 1.25rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Para marcarla como <strong>«Realizada»</strong> primero registra la consulta, o cambia el estado de la cita.
            </p>

            {isClinician && completeBlocked.patients?.id && (
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', marginBottom: '1.25rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                onClick={() => { window.location.href = `/dashboard/consultations/new?patientId=${completeBlocked.patients?.id}&appointmentId=${completeBlocked.id}` }}
              >
                <Stethoscope size={16} /> Iniciar consulta
              </button>
            )}

            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '0.5rem' }}>O cambiar el estado a:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {(['PENDING', 'CONFIRMED', 'NO_SHOW', 'CANCELLED'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: '1 1 calc(50% - 0.25rem)' }}
                  onClick={() => { const a = completeBlocked; setCompleteBlocked(null); handleStatusChange(a, s) }}
                >
                  {STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setCompleteBlocked(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
