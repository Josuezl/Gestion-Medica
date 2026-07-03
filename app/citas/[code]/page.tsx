import React from 'react'
import { createAdminClient } from '@/utils/supabase/admin'
import { doctorShortName } from '@/utils/doctorName'
import { formatDateTimeHN } from '@/utils/datetime'

/**
 * Página PÚBLICA de estado de una solicitud de cita del portal de auto-agendamiento.
 * El paciente llega con el tracking code (CITA-XXXXXXXXXX) que se le dio al agendar.
 * Muestra la fecha/hora ACTUAL de la cita (refleja ediciones del staff), nunca más datos
 * que los que el propio paciente envió.
 */

const STATUS_VIEW = {
  PENDING: {
    color: '#b45309', bg: '#fffbeb', border: '#fde68a',
    title: 'En revisión',
    body: 'Tu solicitud fue recibida y está pendiente de aprobación por la clínica. Te contactarán para confirmarla.',
  },
  APPROVED: {
    color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0',
    title: 'Cita aprobada',
    body: 'Tu cita fue aprobada. Te esperamos en la fecha y hora indicadas.',
  },
  REJECTED: {
    color: '#b91c1c', bg: '#fef2f2', border: '#fecaca',
    title: 'No aprobada',
    body: 'Tu solicitud de cita no fue aprobada. Comunícate con la clínica si necesitas reagendar.',
  },
} as const

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '460px', width: '100%', backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.04)', padding: '36px 28px', boxSizing: 'border-box', textAlign: 'center' }}>
        {children}
      </div>
    </div>
  )
}

export default async function BookingStatusPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const sanitized = decodeURIComponent(code).trim().toUpperCase().replace(/[–—]/g, '-')

  let request: any = null
  if (/^CITA-[0-9A-Z]{10}$/.test(sanitized)) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('booking_requests')
      .select(`
        status, requested_at, rejection_reason, submitted_first_name, submitted_last_name, created_at,
        appointments ( scheduled_at, status ),
        doctor:user_profiles!booking_requests_doctor_id_fkey ( first_name, last_name, gender ),
        clinics ( name ),
        locations ( name )
      `)
      .eq('tracking_code', sanitized)
      .maybeSingle()
    request = data
  }

  if (!request) {
    return (
      <Shell>
        <h1 style={{ margin: '0 0 12px', fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>Código no encontrado</h1>
        <p style={{ margin: 0, fontSize: '14px', color: '#64748b', lineHeight: 1.6 }}>
          No encontramos ninguna solicitud de cita con ese código. Verifica que lo hayas escrito
          exactamente como se te mostró al agendar (ej. CITA-A1B2C3D4E5).
        </p>
      </Shell>
    )
  }

  const view = STATUS_VIEW[(request.status as keyof typeof STATUS_VIEW)] ?? STATUS_VIEW.PENDING
  // Fecha/hora vigente: la de la cita (el staff pudo moverla); si ya no existe, la solicitada.
  const scheduledAt: string | null = request.appointments?.scheduled_at ?? request.requested_at ?? null
  // Si el staff canceló una cita ya aprobada, mostrarlo como no aprobada/cancelada.
  const effectiveView = (request.status === 'APPROVED' && request.appointments?.status === 'CANCELLED')
    ? { ...STATUS_VIEW.REJECTED, title: 'Cita cancelada', body: 'Tu cita fue cancelada por la clínica. Comunícate con ellos si necesitas reagendar.' }
    : view

  const doctorName = doctorShortName(request.doctor?.first_name, request.doctor?.last_name, request.doctor?.gender)

  return (
    <Shell>
      <h3 style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 800, color: '#0d9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Estado de tu cita
      </h3>
      <div style={{ display: 'inline-block', padding: '6px 16px', borderRadius: '999px', backgroundColor: effectiveView.bg, border: `1px solid ${effectiveView.border}`, color: effectiveView.color, fontWeight: 800, fontSize: '15px', marginBottom: '14px' }}>
        {effectiveView.title}
      </div>
      <p style={{ margin: '0 0 20px', fontSize: '13.5px', color: '#64748b', lineHeight: 1.6 }}>{effectiveView.body}</p>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', fontSize: '14px', color: '#0f172a', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div><strong>Paciente:</strong> {request.submitted_first_name} {request.submitted_last_name}</div>
        <div><strong>Médico:</strong> {doctorName}</div>
        <div><strong>Lugar:</strong> {request.clinics?.name || 'Clínica'}{request.locations?.name ? ` · ${request.locations.name}` : ''}</div>
        {scheduledAt && <div><strong>Fecha y hora:</strong> {formatDateTimeHN(scheduledAt)}</div>}
        {request.status === 'REJECTED' && request.rejection_reason && (
          <div><strong>Motivo:</strong> {request.rejection_reason}</div>
        )}
      </div>

      <p style={{ margin: '20px 0 0', fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }}>
        Código de seguimiento: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{sanitized}</span>
      </p>
    </Shell>
  )
}
