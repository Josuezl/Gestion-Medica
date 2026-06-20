'use client'

import React, { useEffect, useState, useTransition } from 'react'
import { Heart, X, Loader2, Stethoscope } from 'lucide-react'
import { savePreclinicalVitals, getPendingPreclinical } from '@/app/dashboard/preclinical/actions'

/**
 * Modal de PRE-CLÍNICA: la Auxiliar de Enfermería (o el médico) toma los signos vitales del
 * paciente antes de la consulta. Si ya hay una pre-clínica pendiente de hoy, precarga sus valores
 * para editarla (no se duplica). Reusa los mismos nombres de campo del formulario de consulta.
 */
export default function PreclinicalVitalsModal({ patient, appointmentId = null, onClose, onSaved }: {
  patient: any
  appointmentId?: string | null
  onClose: () => void
  onSaved?: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [existing, setExisting] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    getPendingPreclinical(patient.id).then((row) => {
      if (active) { setExisting(row); setLoading(false) }
    })
    return () => { active = false }
  }, [patient.id])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await savePreclinicalVitals(patient.id, appointmentId, formData)
      if (res?.error) { setError(res.error); return }
      onSaved?.()
      onClose()
    })
  }

  const patientName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim()

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem', boxSizing: 'border-box'
    }}>
      <div style={{
        backgroundColor: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '560px',
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
        border: '1px solid #e2e8f0', padding: '24px', position: 'relative'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Stethoscope size={20} color="var(--primary)" /> Pre-clínica · Signos Vitales
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b' }}>
            <X size={20} />
          </button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: '#475569' }}>
          {patientName}{existing ? ' · editando los signos ya registrados hoy' : ''}
        </p>

        {error && (
          <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', padding: '2rem', justifyContent: 'center' }}>
            <Loader2 size={18} className="animate-spin" /> Cargando…
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">Presión Arterial</label>
                <input className="form-input" name="blood_pressure" placeholder="Ej. 120/80" defaultValue={existing?.blood_pressure || ''} />
              </div>
              <div className="form-group">
                <label className="form-label">Temperatura (°C)</label>
                <input className="form-input" type="number" step="0.1" name="temperature" placeholder="Ej. 36.8" defaultValue={existing?.temperature ?? ''} />
              </div>
              <div className="form-group">
                <label className="form-label">Peso (kg)</label>
                <input className="form-input" type="number" step="0.01" name="weight" placeholder="Ej. 70.5" defaultValue={existing?.weight ?? ''} />
              </div>
              <div className="form-group">
                <label className="form-label">Talla (cm)</label>
                <input className="form-input" type="number" step="0.1" name="height" placeholder="Ej. 175.5" defaultValue={existing?.height ?? ''} />
              </div>
              {patient.is_pediatric && (
                <div className="form-group">
                  <label className="form-label">Perímetro Cefálico (cm)</label>
                  <input className="form-input" type="number" step="0.1" name="head_circumference" placeholder="Ej. 48.5" defaultValue={existing?.head_circumference ?? ''} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Ritmo Cardiaco (bpm)</label>
                <input className="form-input" type="number" name="heart_rate" placeholder="Ej. 72" defaultValue={existing?.heart_rate ?? ''} />
              </div>
              <div className="form-group">
                <label className="form-label">Frec. Respiratoria (rpm)</label>
                <input className="form-input" type="number" name="respiratory_rate" placeholder="Ref. 12-20" defaultValue={existing?.respiratory_rate ?? ''} />
              </div>
              <div className="form-group">
                <label className="form-label">SpO2 (%)</label>
                <input className="form-input" type="number" name="oxygen_saturation" placeholder="Ej. 98" defaultValue={existing?.oxygen_saturation ?? ''} />
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <label className="form-label">Observación de enfermería (opcional)</label>
              <textarea className="form-input" name="notes" rows={2} placeholder="Ej. paciente refiere mareo al llegar" defaultValue={existing?.notes || ''} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isPending}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={isPending} style={{ gap: '0.4rem' }}>
                {isPending ? <Loader2 size={16} className="animate-spin" /> : <Heart size={16} />}
                Guardar signos
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
