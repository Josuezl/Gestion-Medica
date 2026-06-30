'use client'

import React, { useState, useTransition } from 'react'
import { FileText, X, Loader2, Printer, CheckCircle2 } from 'lucide-react'
import { updateConsultationMedicalLeave } from '@/app/dashboard/consultations/actions'
import { doctorShortName } from '@/utils/doctorName'

/**
 * Modal para EMITIR (o corregir) la incapacidad médica sobre la ÚLTIMA consulta del paciente, sin
 * editar ningún otro dato clínico. Caso de uso: el médico ya guardó la consulta y el paciente luego
 * pide una incapacidad. Solo se escribe el texto de la incapacidad; el resto de la consulta es de
 * solo lectura. Si la consulta ya tenía incapacidad, se puede corregir y queda auditado (old→new).
 */
export default function MedicalLeaveModal({ consultation, patient, onClose, onSaved }: {
  consultation: any // última consulta: id, created_at, diagnosis, medical_leave, user_profiles
  patient: any
  onClose: () => void
  onSaved?: () => void
}) {
  const hadLeave = !!(consultation?.medical_leave && String(consultation.medical_leave).trim() !== '')
  const [text, setText] = useState<string>(consultation?.medical_leave || '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const consultDate = consultation?.created_at
    ? new Date(consultation.created_at).toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''
  const docProfile = consultation?.user_profiles
  const docName = docProfile ? doctorShortName(docProfile.first_name, docProfile.last_name, docProfile.gender) : ''
  const patientName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const value = text.trim()
    if (!value) { setError('Escribe el texto de la incapacidad.'); return }
    startTransition(async () => {
      const res = await updateConsultationMedicalLeave(consultation.id, value)
      if (res?.error) { setError(res.error); return }
      setSaved(true)
      onSaved?.() // refresca el expediente (pestaña Incapacidades / botón Última Incapacidad)
    })
  }

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
            <FileText size={20} color="var(--primary)" /> {hadLeave ? 'Corregir incapacidad médica' : 'Nueva incapacidad médica'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b' }} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        {saved ? (
          <div style={{ padding: '0.5rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0f766e', fontWeight: 600, margin: '0.5rem 0 1rem' }}>
              <CheckCircle2 size={20} /> Incapacidad guardada
            </div>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', color: '#475569' }}>
              Ya quedó registrada en la consulta del {consultDate}. Puedes imprimirla para entregarla al paciente.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
              <a
                href={`/consultations/${consultation.id}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ gap: '0.4rem', textDecoration: 'none' }}
              >
                <Printer size={16} /> Imprimir incapacidad
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#475569' }}>
              Se agregará a la última consulta de <strong>{patientName}</strong>
              {consultDate && <> del <strong>{consultDate}</strong></>}
              {docName && <> · {docName}</>}.
            </p>

            {consultation?.diagnosis && String(consultation.diagnosis).trim() !== '' && (
              <div style={{ marginBottom: '12px', padding: '0.6rem 0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: '0.2rem' }}>Diagnóstico (solo lectura)</div>
                <div style={{ fontSize: '0.85rem', color: '#475569' }}>{consultation.diagnosis}</div>
              </div>
            )}

            {hadLeave && (
              <div style={{ marginBottom: '12px', padding: '0.6rem 0.75rem', background: 'rgba(180, 83, 9, 0.08)', border: '1px solid rgba(180, 83, 9, 0.3)', borderRadius: '8px', fontSize: '0.82rem', color: '#b45309', fontWeight: 600 }}>
                Esta consulta ya tiene una incapacidad emitida. Corregirla quedará registrado en la bitácora.
              </div>
            )}

            {error && (
              <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Incapacidad médica</label>
              <textarea
                className="form-input"
                rows={5}
                placeholder="Ej. Se extiende incapacidad por 3 días a partir de la fecha, por motivo de…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isPending}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={isPending} style={{ gap: '0.4rem' }}>
                {isPending ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                Guardar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
