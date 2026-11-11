'use client'

import React, { useState, useTransition } from 'react'
import { Share2, X, Loader2, Printer, CheckCircle2 } from 'lucide-react'
import { updateConsultationReferral } from '@/app/dashboard/consultations/actions'
import { doctorShortName } from '@/utils/doctorName'
import type { ConsultationRow, PatientRow } from '@/utils/clinicalTypes'
import { CamposReferencia, type ReferralValue } from '../../components/CamposIncapacidad'
import { validateReferral } from '@/utils/incapacidad'

/**
 * Modal para EMITIR (o corregir) la referencia médica sobre la ÚLTIMA consulta del paciente, sin
 * editar ningún otro dato clínico (mismo patrón que MedicalLeaveModal). Caso de uso: el médico
 * necesita referir al paciente sin crear una consulta nueva. Solo se escriben destinatario y motivo.
 * Si la consulta ya tenía referencia, se corrige y queda auditado (old→new).
 */
export default function ReferralModal({ consultation, patient, onClose, onSaved }: {
  consultation: ConsultationRow
  patient: Pick<PatientRow, 'first_name' | 'last_name'>
  onClose: () => void
  onSaved?: () => void
}) {
  const hadReferral = !!(consultation?.referral && String(consultation.referral).trim() !== '')
  const [referral, setReferral] = useState<ReferralValue>({
    to: consultation?.referral_to || '',
    reason: consultation?.referral || '',
  })
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
    const invalid = validateReferral(referral)
    if (invalid) { setError(invalid); return }
    startTransition(async () => {
      const res = await updateConsultationReferral(consultation.id, referral.to, referral.reason)
      if (res?.error) { setError(res.error); return }
      setSaved(true)
      onSaved?.() // refresca el expediente (pestaña Referencias)
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
            <Share2 size={20} color="var(--primary)" /> {hadReferral ? 'Corregir referencia médica' : 'Nueva referencia médica'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b' }} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        {saved ? (
          <div style={{ padding: '0.5rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0f766e', fontWeight: 600, margin: '0.5rem 0 1rem' }}>
              <CheckCircle2 size={20} /> Referencia guardada
            </div>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', color: '#475569' }}>
              Ya quedó registrada en la consulta del {consultDate}. Puedes imprimirla o enviarla desde la pestaña Referencias.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
              <a
                href={`/consultations/${consultation.id}/print?doc=referral`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ gap: '0.4rem', textDecoration: 'none' }}
              >
                <Printer size={16} /> Imprimir referencia
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
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: '0.2rem' }}>Diagnóstico de la consulta</div>
                <div style={{ fontSize: '0.85rem', color: '#475569' }}>{consultation.diagnosis}</div>
              </div>
            )}

            {hadReferral && (
              <div style={{ marginBottom: '12px', padding: '0.6rem 0.75rem', background: 'rgba(180, 83, 9, 0.08)', border: '1px solid rgba(180, 83, 9, 0.3)', borderRadius: '8px', fontSize: '0.82rem', color: '#b45309', fontWeight: 600 }}>
                Esta consulta ya tiene una referencia emitida. Corregirla quedará registrado en la bitácora.
              </div>
            )}

            {error && (
              <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                {error}
              </div>
            )}

            <CamposReferencia value={referral} onChange={setReferral} />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isPending}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={isPending} style={{ gap: '0.4rem' }}>
                {isPending ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                Guardar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
