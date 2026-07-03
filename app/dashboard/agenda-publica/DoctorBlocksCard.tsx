'use client'

import React, { useState } from 'react'
import { createDoctorBlock, deleteDoctorBlock } from './actions'
import { doctorShortName } from '@/utils/doctorName'
import { formatDateHN } from '@/utils/datetime'
import { CalendarOff, Plus, Loader2, Trash2 } from 'lucide-react'

interface BlockRow {
  id: string
  doctor_id: string
  start_date: string
  end_date: string
  reason: string | null
}

interface DoctorOption {
  id: string
  first_name?: string | null
  last_name?: string | null
  gender?: string | null
}

/**
 * Card de "Agenda en línea": días bloqueados por médico (vacaciones, congresos, permisos).
 * El portal público deja de ofrecer esas fechas en todas sus sedes; la agenda interna no
 * cambia (el staff puede seguir agendando a mano si hace falta).
 */
export default function DoctorBlocksCard({ doctors, blocks }: { doctors: DoctorOption[]; blocks: BlockRow[] }) {
  const [doctorId, setDoctorId] = useState(doctors[0]?.id || '')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const doctorLabel = (id: string) => {
    const d = doctors.find(doc => doc.id === id)
    return d ? doctorShortName(d.first_name, d.last_name, d.gender) : 'Médico'
  }
  // Las fechas son calendario puro: mediodía UTC evita el corrimiento de día al formatear.
  const fmt = (ymd: string) => formatDateHN(`${ymd}T12:00:00Z`)

  const handleCreate = async () => {
    setError(null)
    if (!startDate || !endDate) { setError('Selecciona las fechas del bloqueo.'); return }
    if (endDate < startDate) { setError('La fecha final debe ser igual o posterior a la inicial.'); return }
    setBusy(true)
    const res = await createDoctorBlock(doctorId, startDate, endDate, reason)
    setBusy(false)
    if (res?.error) { setError(res.error); return }
    setStartDate(''); setEndDate(''); setReason('')
  }

  const handleDelete = async (block: BlockRow) => {
    if (!confirm(`¿Quitar el bloqueo de ${doctorLabel(block.doctor_id)} (${fmt(block.start_date)} – ${fmt(block.end_date)})? El portal volverá a ofrecer esas fechas.`)) return
    setBusy(true)
    const res = await deleteDoctorBlock(block.id)
    setBusy(false)
    if (res?.error) setError(res.error)
  }

  if (doctors.length === 0) return null

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <CalendarOff size={20} color="var(--primary)" />
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Días bloqueados</h3>
      </div>
      <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Vacaciones, congresos o permisos: el enlace público no ofrecerá estas fechas
        (en ninguna clínica del médico). La agenda interna no se ve afectada.
      </p>

      {error && (
        <div style={{ padding: '0.6rem 0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
        <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '180px', maxWidth: '280px' }}>
          <label className="form-label">Médico</label>
          <select className="form-input" value={doctorId} onChange={e => setDoctorId(e.target.value)}>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{doctorShortName(d.first_name, d.last_name, d.gender)}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Desde</label>
          <input className="form-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Hasta</label>
          <input className="form-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '160px' }}>
          <label className="form-label">Motivo (opcional)</label>
          <input className="form-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej. Congreso médico" maxLength={200} />
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={handleCreate} style={{ gap: '0.35rem', whiteSpace: 'nowrap' }}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Bloquear
        </button>
      </div>

      {blocks.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>No hay días bloqueados próximos.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {blocks.map(block => (
            <div key={block.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem 0.65rem' }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: '0.85rem' }}>
                <strong>{doctorLabel(block.doctor_id)}</strong>
                <span style={{ color: 'var(--text-muted)' }}>
                  {' '}· {block.start_date === block.end_date ? fmt(block.start_date) : `${fmt(block.start_date)} – ${fmt(block.end_date)}`}
                  {block.reason ? ` · ${block.reason}` : ''}
                </span>
              </div>
              <button
                title="Quitar bloqueo"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex' }}
                disabled={busy}
                onClick={() => handleDelete(block)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
