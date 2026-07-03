'use client'

import React from 'react'
import { Clipboard, FileText, Stethoscope, Edit2, Trash2, Clock } from 'lucide-react'
import StatusDropdown, { STATUS_CONFIG } from '../StatusDropdown'
import { doctorShortName } from '@/utils/doctorName'
import type { Appointment, Doctor } from '../AgendaClient'

interface AppointmentCardProps {
  app: Appointment
  doctors: Doctor[]
  isClinician: boolean
  canTakeVitals: boolean
  isPreclinicalReady: boolean
  onStatusChange: (status: string) => void
  onEdit: () => void
  onDelete: () => void
  onTakeVitals: () => void
}

/**
 * Tarjeta de cita de la vista Agenda. Diseño en tres filas: nombre + datos + estado;
 * notas/motivo debajo del nombre; y la fila de acciones (incluye editar y eliminar).
 * Reemplaza el render inline que vivía en AgendaClient.
 */
export default function AppointmentCard({
  app,
  doctors,
  isClinician,
  canTakeVitals,
  isPreclinicalReady,
  onStatusChange,
  onEdit,
  onDelete,
  onTakeVitals,
}: AppointmentCardProps) {
  const cfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.PENDING
  const date = new Date(app.scheduled_at)

  // Hora dividida en reloj ("08:00") y meridiano ("a. m.") para apilarlos.
  const hhmm = date.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: true })
  const spaceIdx = hhmm.indexOf(' ')
  const clock = spaceIdx === -1 ? hhmm : hhmm.slice(0, spaceIdx)
  const meridiem = spaceIdx === -1 ? '' : hhmm.slice(spaceIdx + 1)

  // Edad del paciente (años cumplidos).
  let ageText = ''
  if (app.patients?.birth_date) {
    const birth = new Date(app.patients.birth_date)
    const ageDt = new Date(Date.now() - birth.getTime())
    const age = Math.abs(ageDt.getUTCFullYear() - 1970)
    ageText = `${age} años • `
  }

  const fullName = `${app.patients?.first_name || ''} ${app.patients?.last_name || ''}`.trim()

  const handleWhatsApp = () => {
    const doctor = doctors.find(d => d.id === app.doctor_id)
    const docName = doctorShortName(doctor?.first_name, doctor?.last_name, doctor?.gender)
    const dateStr = date.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })
    const text = `Hola ${app.patients?.first_name || ''} ${app.patients?.last_name || ''}, te recordamos tu cita programada:\n\n📅 Fecha: ${dateStr}\n⏰ Hora: ${hhmm}\n🩺 Médico: ${docName}\n\nPor favor, confírmanos tu asistencia respondiendo a este mensaje. ¡Te esperamos!`
    const patientPhoneClean = app.patients?.phone ? app.patients.phone.replace(/\D/g, '') : ''
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${patientPhoneClean}&text=${encodeURIComponent(text)}`
    window.open(whatsappUrl, '_blank', 'noreferrer')
  }

  const canStartConsultation = isClinician && ['WAITING', 'IN_PROGRESS', 'CONFIRMED', 'PENDING'].includes(app.status)
  // La preclínica solo aplica antes/durante la cita: se oculta en estados terminales
  // (Cancelada, No se presentó, Realizada).
  const canTakePreclinical = canTakeVitals && !!app.patients?.id && ['PENDING', 'CONFIRMED', 'WAITING', 'IN_PROGRESS'].includes(app.status)
  // Solicitud del portal público: su ciclo de vida se gestiona en "Solicitudes" (aprobar crea o
  // asigna la ficha del paciente). Aquí solo se muestra bloqueando el slot, con acceso directo.
  const isPendingReview = app.status === 'PENDING_REVIEW'

  return (
    <div className="appt-card-v2" style={{ borderLeftColor: cfg.dotColor }}>
      {/* Columna de hora: centrada, sin fondo; la hora en negro como el nombre. */}
      <div className="appt-card-v2-time">
        <Clock size={14} className="appt-time-icon" />
        <span className="appt-time-clock">{clock}</span>
        {meridiem && <span className="appt-time-mer">{meridiem}</span>}
      </div>

      {/* Cuerpo: nombre + datos + estado; notas debajo del nombre; y la fila de acciones. */}
      <div className="appt-card-v2-body">
        <div className="appt-card-v2-header">
          <div className="appt-card-v2-name" title={fullName}>{fullName}</div>
          <span className="appt-card-v2-meta">({ageText}Tel: {app.patients?.phone || 'Sin teléfono'})</span>
        </div>

        {app.notes && (
          <div className="appt-card-v2-notes" title={app.notes}>
            <Clipboard size={14} />
            <span className="appt-card-v2-notes-text">{app.notes}</span>
          </div>
        )}

        {/* Fila de acciones, alineada con el nombre. */}
        <div className="appt-card-v2-actions">
          {canStartConsultation && (
            <button
              className="appt-btn appt-btn-start"
              onClick={() => window.location.href = `/dashboard/consultations/new?patientId=${app.patients?.id}&appointmentId=${app.id}`}
            >
              <Clipboard size={15} /> Iniciar Consulta
            </button>
          )}

          {canTakePreclinical && (
            <button
              className={`appt-btn ${isPreclinicalReady ? 'appt-btn-vitals-ready' : 'appt-btn-vitals'}`}
              onClick={onTakeVitals}
              title={isPreclinicalReady ? 'Preclínica lista — editar' : 'Tomar preclínica (signos vitales)'}
            >
              <Stethoscope size={15} /> {isPreclinicalReady ? 'Preclínica lista' : 'Preclínica'}
            </button>
          )}

          {app.patients?.id && (
            <button
              className="appt-btn appt-btn-record"
              onClick={() => window.location.href = `/dashboard/patients/${app.patients?.id}`}
              title="Abrir expediente del paciente"
            >
              <FileText size={15} /> Expediente
            </button>
          )}

          {isPendingReview ? (
            <button
              className="appt-btn"
              style={{ backgroundColor: '#fae8ff', color: '#a855f7', fontWeight: 700 }}
              onClick={() => window.location.href = '/dashboard/solicitudes'}
              title="Cita agendada por el paciente desde el enlace público — revisar en Solicitudes"
            >
              Por aprobar · Revisar
            </button>
          ) : (
            <StatusDropdown status={app.status} onChange={onStatusChange} />
          )}

          <button
            className="appt-btn appt-btn-wa"
            onClick={handleWhatsApp}
            title="Enviar recordatorio por WhatsApp"
            aria-label="Enviar recordatorio por WhatsApp"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ display: 'block' }}>
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.003 5.324 5.328 0 11.896 0c3.181.001 6.173 1.24 8.424 3.493 2.25 2.253 3.487 5.244 3.484 8.427-.004 6.578-5.329 11.902-11.897 11.902-2.003-.001-3.973-.505-5.727-1.467L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.725 1.45 5.247 0 9.518-4.268 9.52-9.51 0-2.54-1-4.927-2.817-6.724-1.815-1.8-4.223-2.79-6.733-2.792-5.253 0-9.526 4.268-9.529 9.511 0 1.63.43 3.22 1.25 4.63l-.993 3.626 3.725-.976zm11.233-6.006c-.3-.15-1.772-.875-2.047-.975-.276-.1-.477-.15-.677.15-.2.3-.777.975-.952 1.175-.176.2-.351.225-.651.075-1.204-.6-2.002-1.054-2.8-2.427-.21-.362.21-.337.6-.113.35.2.775.9.875 1.1.1.2.05.375-.025.525-.075.15-.677.8-1.002 1.175-.325.375-.65.3-.95.15-1.157-.58-1.907-1.01-2.67-2.327-.15-.257-.15-.425.075-.65.2-.2.45-.525.677-.8.225-.275.3-.475.45-.775.15-.3.075-.575-.025-.775-.1-.2-.677-1.625-.927-2.225-.244-.588-.492-.51-.677-.52l-.576-.007c-.2 0-.527.075-.803.375-.276.3-1.053 1.025-1.053 2.5 0 1.475 1.078 2.9 1.228 3.1.15.2 2.122 3.24 5.141 4.542.717.31 1.277.494 1.714.633.72.228 1.376.196 1.894.118.577-.087 1.772-.725 2.022-1.425.25-.7.25-1.3 1.75-1.425-.075-.125-.275-.2-.575-.35z" />
            </svg>
          </button>

          {!isPendingReview && (
            <button
              className="appt-btn appt-btn-icon"
              onClick={onEdit}
              title="Editar cita"
              aria-label="Editar cita"
            >
              <Edit2 size={16} />
            </button>
          )}

          <button
            className="appt-btn appt-btn-icon"
            onClick={onDelete}
            title="Eliminar cita"
            aria-label="Eliminar cita"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
