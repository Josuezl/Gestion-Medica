'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveBookingRequest, rejectBookingRequest, type ApproveDecision, type WhatsAppPrompt } from './actions'
import { searchPatientsForAgenda } from '@/app/dashboard/patients/actions'
import type { PatientSuggestion } from './page'
import { formatDateTimeHN, formatDateHN } from '@/utils/datetime'
import { doctorShortName } from '@/utils/doctorName'
import { CheckCircle2, XCircle, Search, Loader2, UserPlus, UserCheck, Inbox, Globe } from 'lucide-react'

/**
 * Bandeja de revisión de solicitudes del portal público. Aprobar pide decidir el paciente
 * (crear ficha nueva con género, o asignar a uno existente — sugerencias incluidas) y permite
 * ajustar fecha/hora; rechazar pide un motivo opcional. Tras ambas se ofrece el mensaje de
 * WhatsApp click-to-chat (manual, igual que el botón de la agenda).
 */

interface RequestRow {
  id: string
  matched_patient_id: string | null
  created_at: string
  tracking_code: string
  submitted_first_name: string
  submitted_last_name: string
  submitted_birth_date: string | null
  submitted_id_card: string | null
  submitted_phone: string | null
  appointments: { id: string; scheduled_at: string; status: string } | null
  doctor: { first_name: string; last_name: string; gender?: string | null } | null
  locations: { name: string } | null
  matched_patient: { id: string; first_name: string; last_name: string; birth_date: string | null; phone: string | null; id_card: string | null } | null
  suggestions: PatientSuggestion[]
}

// Honduras es UTC-6 fijo: derivar fecha/hora local del ISO sin librerías.
const isoToHN = (iso: string) => new Date(new Date(iso).getTime() - 6 * 3600_000).toISOString()
const isoToHNDate = (iso: string) => isoToHN(iso).slice(0, 10)
const isoToHNTime = (iso: string) => isoToHN(iso).slice(11, 16)

const openWhatsApp = (wa: WhatsAppPrompt) => {
  window.open(`https://api.whatsapp.com/send?phone=${wa.phone}&text=${encodeURIComponent(wa.message)}`, '_blank', 'noreferrer')
}

export default function SolicitudesClient({ requests }: { requests: RequestRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal de aprobación
  const [approving, setApproving] = useState<RequestRow | null>(null)
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [existingPatient, setExistingPatient] = useState<{ id: string; label: string } | null>(null)
  const [patientSearch, setPatientSearch] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [npFirst, setNpFirst] = useState('')
  const [npLast, setNpLast] = useState('')
  const [npBirth, setNpBirth] = useState('')
  const [npGender, setNpGender] = useState<'' | 'M' | 'F'>('')
  const [npIdCard, setNpIdCard] = useState('')
  const [npPhone, setNpPhone] = useState('')
  const [apptDate, setApptDate] = useState('')
  const [apptTime, setApptTime] = useState('')
  const [finalStatus, setFinalStatus] = useState<'CONFIRMED' | 'PENDING'>('CONFIRMED')
  const [duplicateWarn, setDuplicateWarn] = useState<{ id: string; name: string; birthDate: string | null; block: boolean } | null>(null)

  // Modal de rechazo
  const [rejecting, setRejecting] = useState<RequestRow | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Prompt de WhatsApp tras aprobar/rechazar
  const [waPrompt, setWaPrompt] = useState<{ wa: WhatsAppPrompt | undefined; title: string } | null>(null)

  const openApprove = (req: RequestRow, preselect?: { id: string; label: string }) => {
    setApproving(req)
    setError(null)
    setDuplicateWarn(null)
    const matched = req.matched_patient
    const chosen = preselect || (matched ? { id: matched.id, label: `${matched.first_name} ${matched.last_name}` } : null)
    setMode(chosen ? 'existing' : 'new')
    setExistingPatient(chosen)
    setPatientSearch('')
    setSearchResults([])
    setNpFirst(req.submitted_first_name)
    setNpLast(req.submitted_last_name)
    setNpBirth(req.submitted_birth_date || '')
    setNpGender('')
    setNpIdCard(req.submitted_id_card || '')
    setNpPhone(req.submitted_phone || '')
    setApptDate(req.appointments ? isoToHNDate(req.appointments.scheduled_at) : '')
    setApptTime(req.appointments ? isoToHNTime(req.appointments.scheduled_at) : '')
    setFinalStatus('CONFIRMED')
  }

  const handleSearch = async (value: string) => {
    setPatientSearch(value)
    if (value.trim().length < 2) { setSearchResults([]); return }
    setSearching(true)
    const results = await searchPatientsForAgenda(value)
    setSearching(false)
    setSearchResults(results || [])
  }

  const submitApprove = async (force = false) => {
    if (!approving) return
    setError(null)
    if (mode === 'existing' && !existingPatient) { setError('Selecciona el paciente a asignar.'); return }
    if (mode === 'new' && !npGender) { setError('Selecciona el género del paciente (lo requiere la ficha).'); return }
    if (mode === 'new' && !npBirth) { setError('Indica la fecha de nacimiento del paciente.'); return }

    const decision: ApproveDecision = {
      mode,
      existingPatientId: mode === 'existing' ? existingPatient!.id : undefined,
      newPatient: mode === 'new' ? {
        firstName: npFirst, lastName: npLast, birthDate: npBirth,
        gender: npGender as 'M' | 'F', idCard: npIdCard || undefined, phone: npPhone || undefined,
      } : undefined,
      force,
      date: apptDate || undefined,
      time: apptTime || undefined,
      finalStatus,
    }

    setBusy(true)
    const res = await approveBookingRequest(approving.id, decision)
    setBusy(false)

    if ('duplicate' in res) {
      setDuplicateWarn(res.duplicate)
      return
    }
    if ('error' in res) { setError(res.error); return }

    setApproving(null)
    setDuplicateWarn(null)
    setWaPrompt({ wa: res.whatsapp, title: 'Cita aprobada' })
  }

  const submitReject = async () => {
    if (!rejecting) return
    setBusy(true)
    const res = await rejectBookingRequest(rejecting.id, rejectReason)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    setRejecting(null)
    setRejectReason('')
    setWaPrompt({ wa: res.whatsapp, title: 'Solicitud rechazada' })
  }

  const closeWaPrompt = () => {
    setWaPrompt(null)
    router.refresh()
  }

  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }

  if (requests.length === 0 && !waPrompt) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <Inbox size={40} color="var(--text-muted)" style={{ marginBottom: '0.75rem' }} />
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>No hay solicitudes pendientes</h3>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Cuando un paciente agende desde el enlace público, su solicitud aparecerá aquí.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error && !approving && !rejecting && (
        <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px', fontSize: '0.9rem' }}>{error}</div>
      )}

      {requests.map(req => {
        const docName = doctorShortName(req.doctor?.first_name, req.doctor?.last_name, req.doctor?.gender)
        return (
          <div key={req.id} className="card" style={{ borderLeft: '4px solid #a855f7' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Globe size={15} color="#a855f7" />
                  <strong style={{ fontSize: '1rem' }}>{req.submitted_first_name} {req.submitted_last_name}</strong>
                  {req.matched_patient ? (
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', background: '#dcfce7', color: '#15803d' }}>
                      Paciente existente
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', background: '#fae8ff', color: '#a855f7' }}>
                      Paciente nuevo (sin ficha)
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  <span>📅 {req.appointments ? formatDateTimeHN(req.appointments.scheduled_at) : '—'} · 🩺 {docName}{req.locations?.name ? ` · 📍 ${req.locations.name}` : ''}</span>
                  <span>
                    {req.submitted_birth_date ? `Nacimiento: ${formatDateHN(`${req.submitted_birth_date}T12:00:00Z`)} · ` : ''}
                    {req.submitted_id_card ? `Identidad: ${req.submitted_id_card} · ` : ''}
                    {req.submitted_phone ? `Tel: ${req.submitted_phone}` : 'Sin teléfono'}
                  </span>
                  <span style={{ fontSize: '0.78rem' }}>Recibida: {formatDateTimeHN(req.created_at)} · Código: <span style={{ fontFamily: 'monospace' }}>{req.tracking_code}</span></span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button className="btn btn-primary" style={{ gap: '0.35rem' }} disabled={busy} onClick={() => openApprove(req)}>
                  <CheckCircle2 size={16} /> Revisar y aprobar
                </button>
                <button className="btn btn-secondary" style={{ gap: '0.35rem', color: 'var(--danger)' }} disabled={busy} onClick={() => { setRejecting(req); setError(null) }}>
                  <XCircle size={16} /> Rechazar
                </button>
              </div>
            </div>

            {req.suggestions.length > 0 && (
              <div style={{ marginTop: '0.85rem', padding: '0.65rem 0.75rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#b45309', marginBottom: '0.4rem' }}>
                  ¿Ya existía? Pacientes parecidos en tu clínica:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {req.suggestions.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                      <span style={{ flex: 1, minWidth: '200px' }}>
                        <strong>{s.first_name} {s.last_name}</strong>
                        {s.birth_date ? ` · ${formatDateHN(`${s.birth_date}T12:00:00Z`)}` : ''}
                        {s.phone ? ` · ${s.phone}` : ''}
                        <span style={{ color: '#b45309' }}> ({s.reason})</span>
                      </span>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem', gap: '0.3rem' }}
                        disabled={busy}
                        onClick={() => openApprove(req, { id: s.id, label: `${s.first_name} ${s.last_name}` })}
                      >
                        <UserCheck size={13} /> Usar este paciente
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* MODAL: aprobar */}
      {approving && (
        <div style={overlay}>
          <div className="card" style={{ maxWidth: '560px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Aprobar solicitud</h3>
              <button onClick={() => setApproving(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <XCircle size={22} color="#64748b" />
              </button>
            </div>

            {error && (
              <div style={{ padding: '0.6rem 0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>{error}</div>
            )}

            {duplicateWarn && (
              <div style={{ padding: '0.75rem', background: duplicateWarn.block ? '#fee2e2' : '#fffbeb', border: `1px solid ${duplicateWarn.block ? '#fecaca' : '#fde68a'}`, borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', lineHeight: 1.5 }}>
                {duplicateWarn.block ? (
                  <>
                    <strong>Duplicado exacto:</strong> ya existe <strong>{duplicateWarn.name}</strong>
                    {duplicateWarn.birthDate ? ` (${formatDateHN(`${duplicateWarn.birthDate}T12:00:00Z`)})` : ''} con el mismo nombre, fecha y género.
                    No se puede crear otra ficha: usa «Asignar a paciente existente».
                    <div style={{ marginTop: '0.5rem' }}>
                      <button className="btn btn-primary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem' }} onClick={() => { setMode('existing'); setExistingPatient({ id: duplicateWarn.id, label: duplicateWarn.name }); setDuplicateWarn(null) }}>
                        Asignar a {duplicateWarn.name}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <strong>Posible duplicado:</strong> existe <strong>{duplicateWarn.name}</strong>
                    {duplicateWarn.birthDate ? ` (${formatDateHN(`${duplicateWarn.birthDate}T12:00:00Z`)})` : ''}. ¿Crear la ficha de todas formas?
                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem' }} onClick={() => { setMode('existing'); setExistingPatient({ id: duplicateWarn.id, label: duplicateWarn.name }); setDuplicateWarn(null) }}>
                        Mejor asignar a {duplicateWarn.name}
                      </button>
                      <button className="btn btn-primary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem' }} disabled={busy} onClick={() => submitApprove(true)}>
                        Crear de todas formas
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Selector de modo */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                className={mode === 'new' ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ flex: 1, gap: '0.35rem' }}
                onClick={() => { setMode('new'); setDuplicateWarn(null); setError(null) }}
              >
                <UserPlus size={15} /> Crear ficha nueva
              </button>
              <button
                className={mode === 'existing' ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ flex: 1, gap: '0.35rem' }}
                onClick={() => { setMode('existing'); setDuplicateWarn(null); setError(null) }}
              >
                <UserCheck size={15} /> Asignar a existente
              </button>
            </div>

            {mode === 'new' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Nombres</label>
                  <input className="form-input" value={npFirst} onChange={e => setNpFirst(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Apellidos</label>
                  <input className="form-input" value={npLast} onChange={e => setNpLast(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fecha de nacimiento</label>
                  <input className="form-input" type="date" value={npBirth} onChange={e => setNpBirth(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Género (requerido)</label>
                  <select className="form-input" value={npGender} onChange={e => setNpGender(e.target.value as any)}>
                    <option value="">Seleccionar…</option>
                    <option value="F">Femenino</option>
                    <option value="M">Masculino</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Identidad</label>
                  <input className="form-input" value={npIdCard} onChange={e => setNpIdCard(e.target.value)} placeholder="Opcional" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Teléfono</label>
                  <input className="form-input" value={npPhone} onChange={e => setNpPhone(e.target.value)} placeholder="Opcional" />
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: '1rem' }}>
                {existingPatient ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.75rem', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '8px' }}>
                    <UserCheck size={16} color="#0d9488" />
                    <strong style={{ flex: 1, fontSize: '0.9rem' }}>{existingPatient.label}</strong>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }} onClick={() => setExistingPatient(null)}>Cambiar</button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <Search size={15} color="#64748b" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      className="form-input"
                      style={{ paddingLeft: '2rem' }}
                      placeholder="Buscar paciente por nombre, identidad o teléfono…"
                      value={patientSearch}
                      onChange={e => handleSearch(e.target.value)}
                    />
                    {(searching || searchResults.length > 0) && patientSearch.trim().length >= 2 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', marginTop: '4px', maxHeight: '200px', overflowY: 'auto', zIndex: 10, boxShadow: '0 8px 16px rgba(0,0,0,0.08)' }}>
                        {searching ? (
                          <div style={{ padding: '0.6rem', textAlign: 'center' }}><Loader2 size={16} className="animate-spin" /></div>
                        ) : searchResults.map((p: any) => (
                          <button
                            key={p.id}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: '0.85rem' }}
                            onClick={() => setExistingPatient({ id: p.id, label: `${p.first_name} ${p.last_name}` })}
                          >
                            <strong>{p.first_name} {p.last_name}</strong>
                            <span style={{ color: 'var(--text-muted)' }}>
                              {p.birth_date ? ` · ${formatDateHN(`${p.birth_date}T12:00:00Z`)}` : ''}{p.phone ? ` · ${p.phone}` : ''}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Fecha/hora (editable) y estado final */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Fecha</label>
                <input className="form-input" type="date" value={apptDate} onChange={e => setApptDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Hora</label>
                <input className="form-input" type="time" value={apptTime} onChange={e => setApptTime(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Estado final</label>
                <select className="form-input" value={finalStatus} onChange={e => setFinalStatus(e.target.value as any)}>
                  <option value="CONFIRMED">Confirmada</option>
                  <option value="PENDING">Pendiente</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" disabled={busy} onClick={() => setApproving(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ gap: '0.35rem' }} disabled={busy} onClick={() => submitApprove(false)}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Aprobar cita
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: rechazar */}
      {rejecting && (
        <div style={overlay}>
          <div className="card" style={{ maxWidth: '460px', width: '100%' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>Rechazar solicitud</h3>
            <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              La cita de <strong>{rejecting.submitted_first_name} {rejecting.submitted_last_name}</strong> se cancelará
              y el horario quedará libre. El paciente verá «No aprobada» al consultar su código.
            </p>
            {error && (
              <div style={{ padding: '0.6rem 0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>{error}</div>
            )}
            <div className="form-group">
              <label className="form-label">Motivo (opcional, lo verá el paciente)</label>
              <textarea className="form-input" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} maxLength={300} placeholder="Ej. El médico no tendrá consulta ese día." />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" disabled={busy} onClick={() => { setRejecting(null); setError(null) }}>Cancelar</button>
              <button className="btn btn-primary" style={{ background: 'var(--danger)', gap: '0.35rem' }} disabled={busy} onClick={submitReject}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />} Rechazar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: prompt de WhatsApp tras aprobar/rechazar */}
      {waPrompt && (
        <div style={overlay}>
          <div className="card" style={{ maxWidth: '460px', width: '100%' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>{waPrompt.title}</h3>
            {waPrompt.wa ? (
              <>
                <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  ¿Quieres avisarle al paciente por WhatsApp? Se abrirá la app con el mensaje listo para enviar.
                </p>
                <div style={{ padding: '0.75rem', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.82rem', whiteSpace: 'pre-wrap', marginBottom: '1rem', maxHeight: '160px', overflowY: 'auto' }}>
                  {waPrompt.wa.message}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={closeWaPrompt}>No, gracias</button>
                  <button className="btn btn-primary" style={{ gap: '0.35rem' }} onClick={() => { openWhatsApp(waPrompt.wa!); closeWaPrompt() }}>
                    Enviar por WhatsApp
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  El paciente no tiene teléfono registrado, así que no se puede enviar WhatsApp.
                  Considera contactarlo por otro medio.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" onClick={closeWaPrompt}>Entendido</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
