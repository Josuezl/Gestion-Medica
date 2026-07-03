'use client'

import React, { useEffect, useState } from 'react'
import { createBookingLink, deactivateBookingLink, listBookingLinks } from '../actions'
import { doctorShortName } from '@/utils/doctorName'
import { XCircle, Link2, Copy, Check, Loader2, Trash2 } from 'lucide-react'

interface BookingLink {
  id: string
  token: string
  doctor_id: string
  location_id: string | null
  created_at: string
}

interface BookingLinkModalProps {
  doctors: { id: string; first_name: string; last_name: string; gender?: string | null }[]
  locations: { id: string; name: string; is_active: boolean }[]
  onClose: () => void
}

/**
 * Modal "Enlace público de agendamiento": genera y administra los links por médico (+sede)
 * con los que los pacientes agendan solos desde /agendar/[token]. Un solo link activo por
 * médico+sede; generar uno nuevo invalida el anterior.
 */
export default function BookingLinkModal({ doctors, locations, onClose }: BookingLinkModalProps) {
  const activeLocations = locations.filter(l => l.is_active)
  const [links, setLinks] = useState<BookingLink[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doctorId, setDoctorId] = useState(doctors[0]?.id || '')
  const [locationId, setLocationId] = useState(activeLocations.length === 1 ? activeLocations[0].id : '')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listBookingLinks().then(data => {
      if (cancelled) return
      setLinks(data as BookingLink[])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const linkUrl = (token: string) => `${window.location.origin}/agendar/${token}`

  const doctorLabel = (id: string) => {
    const d = doctors.find(doc => doc.id === id)
    return d ? doctorShortName(d.first_name, d.last_name, d.gender) : 'Médico'
  }
  const locationLabel = (id: string | null) =>
    id ? (locations.find(l => l.id === id)?.name ?? 'Sede') : null

  const handleCopy = async (link: BookingLink) => {
    try {
      await navigator.clipboard.writeText(linkUrl(link.token))
      setCopiedId(link.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Fallback silencioso: el usuario puede copiar el texto manualmente.
    }
  }

  const handleGenerate = async () => {
    setError(null)
    if (!doctorId) { setError('Selecciona un médico.'); return }
    if (activeLocations.length > 0 && !locationId) { setError('Selecciona una clínica.'); return }
    const existing = links.find(l => l.doctor_id === doctorId && (l.location_id ?? '') === (locationId || ''))
    if (existing && !confirm('Ya existe un enlace activo para ese médico y sede. Generar uno nuevo INVALIDARÁ el anterior (dejará de funcionar donde ya lo compartiste). ¿Continuar?')) {
      return
    }
    setBusy(true)
    const res = await createBookingLink(doctorId, locationId || null)
    setBusy(false)
    if (res?.error) { setError(res.error); return }
    setLinks(await listBookingLinks() as BookingLink[])
  }

  const handleDeactivate = async (link: BookingLink) => {
    if (!confirm(`¿Desactivar el enlace de ${doctorLabel(link.doctor_id)}? Los pacientes ya no podrán agendar con él.`)) return
    setBusy(true)
    const res = await deactivateBookingLink(link.id)
    setBusy(false)
    if (res?.error) { setError(res.error); return }
    setLinks(links.filter(l => l.id !== link.id))
  }

  return (
    <div className="sidebar-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.2s ease-out forwards' }}>
      <div className="card modal-card" style={{ maxWidth: '560px', width: '100%', animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Link2 size={20} color="var(--primary)" />
            <h3 style={{ margin: 0 }}>Enlace público de agendamiento</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <XCircle size={24} color="#64748b" />
          </button>
        </div>

        <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Comparte este enlace con tus pacientes para que agenden su cita solos (horarios de 1 hora,
          según el horario público del médico en Configuración). Cada cita agendada queda
          <strong> pendiente de aprobación</strong> en «Solicitudes».
        </p>

        {error && (
          <div style={{ padding: '0.6rem 0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '180px' }}>
            <label className="form-label">Médico</label>
            <select className="form-input" value={doctorId} onChange={e => setDoctorId(e.target.value)}>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>{doctorShortName(d.first_name, d.last_name, d.gender)}</option>
              ))}
            </select>
          </div>
          {activeLocations.length > 0 && (
            <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '160px' }}>
              <label className="form-label">Clínica</label>
              <select className="form-input" value={locationId} onChange={e => setLocationId(e.target.value)}>
                <option value="">Seleccionar…</option>
                {activeLocations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}
          <button className="btn btn-primary" disabled={busy} onClick={handleGenerate} style={{ gap: '0.35rem', whiteSpace: 'nowrap' }}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} Generar enlace
          </button>
        </div>

        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Enlaces activos</h4>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
            <Loader2 size={20} className="animate-spin" color="var(--primary)" />
          </div>
        ) : links.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Aún no hay enlaces. Genera el primero arriba.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '260px', overflowY: 'auto' }}>
            {links.map(link => (
              <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem 0.65rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    {doctorLabel(link.doctor_id)}
                    {locationLabel(link.location_id) && (
                      <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · {locationLabel(link.location_id)}</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {linkUrl(link.token)}
                  </div>
                </div>
                <button
                  title="Copiar enlace"
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.5rem', gap: '0.3rem' }}
                  onClick={() => handleCopy(link)}
                >
                  {copiedId === link.id ? <Check size={14} color="var(--primary)" /> : <Copy size={14} />}
                  {copiedId === link.id ? 'Copiado' : 'Copiar'}
                </button>
                <button
                  title="Desactivar enlace"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex' }}
                  disabled={busy}
                  onClick={() => handleDeactivate(link)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
