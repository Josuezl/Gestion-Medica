'use client'

import React, { useState, useTransition } from 'react'
import { Pill, X, Loader2, Printer, CheckCircle2 } from 'lucide-react'
import { createPrescriptionForConsultation } from '@/app/dashboard/consultations/actions'
import { parseMedicinesText } from '@/utils/medicines'
import { doctorShortName } from '@/utils/doctorName'
import type { ConsultationRow, PatientRow } from '@/utils/clinicalTypes'

/**
 * Modal para EMITIR una receta nueva sobre la ÚLTIMA consulta del paciente, sin editar ningún otro
 * dato clínico. Caso de uso: la consulta ya se cerró y el médico luego necesita agregar/reemitir una
 * receta. Los medicamentos se escriben en texto libre (uno por línea), igual que en la consulta.
 */
export default function PrescriptionModal({ consultation, patient, onClose, onSaved }: {
  /** Última consulta del paciente: id, created_at, diagnosis, user_profiles. */
  consultation: ConsultationRow
  patient: Pick<PatientRow, 'first_name' | 'last_name'>
  onClose: () => void
  onSaved?: () => void
}) {
  const [medicinesText, setMedicinesText] = useState('')
  const [notes, setNotes] = useState('')
  const [includeDiagnosis, setIncludeDiagnosis] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const consultDate = consultation?.created_at
    ? new Date(consultation.created_at).toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''
  const docProfile = consultation?.user_profiles
  const docName = docProfile ? doctorShortName(docProfile.first_name, docProfile.last_name, docProfile.gender) : ''
  const patientName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim()
  const hasDiagnosis = !!(consultation?.diagnosis && String(consultation.diagnosis).trim() !== '')

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const medicines = parseMedicinesText(medicinesText)
    if (medicines.length === 0) { setError('Agrega al menos un medicamento (uno por línea).'); return }
    startTransition(async () => {
      const res = await createPrescriptionForConsultation(consultation.id, medicines, notes, includeDiagnosis)
      if (res?.error) { setError(res.error); return }
      setSavedId(res.prescriptionId ?? null)
      onSaved?.() // refresca el expediente (pestaña Recetas Emitidas / botón Última Receta)
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
            <Pill size={20} color="#7c3aed" /> Nueva receta médica
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b' }} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        {savedId ? (
          <div style={{ padding: '0.5rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0f766e', fontWeight: 600, margin: '0.5rem 0 1rem' }}>
              <CheckCircle2 size={20} /> Receta guardada
            </div>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', color: '#475569' }}>
              Ya quedó registrada en la consulta del {consultDate}. Puedes imprimirla para entregarla al paciente.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
              <a
                href={`/prescriptions/${savedId}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ gap: '0.4rem', textDecoration: 'none' }}
              >
                <Printer size={16} /> Imprimir receta
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

            {error && (
              <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Medicamentos (uno por línea)</label>
              <textarea
                className="form-input"
                rows={5}
                placeholder={'Ej.\nAcetaminofén 500 mg cada 8 horas por 5 días\nAmoxicilina 500 mg cada 8 horas por 7 días'}
                value={medicinesText}
                onChange={(e) => setMedicinesText(e.target.value)}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Notas adicionales de la receta (opcional)</label>
              <textarea
                className="form-input"
                rows={2}
                placeholder="Indicaciones generales, recomendaciones…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {hasDiagnosis && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#475569', cursor: 'pointer', marginBottom: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={includeDiagnosis}
                  onChange={(e) => setIncludeDiagnosis(e.target.checked)}
                />
                Incluir el diagnóstico de la consulta en la receta
              </label>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isPending}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={isPending} style={{ gap: '0.4rem' }}>
                {isPending ? <Loader2 size={16} className="animate-spin" /> : <Pill size={16} />}
                Guardar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
