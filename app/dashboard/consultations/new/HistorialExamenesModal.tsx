'use client'

import React, { useEffect } from 'react'
import { FlaskConical, X } from 'lucide-react'
import { doctorShortName } from '@/utils/doctorName'
import { formatDateLongHN } from '@/utils/datetime'
import type { ConsultationRow } from '@/utils/clinicalTypes'

/** Consultas anteriores con «Resultados de estudios» escritos, de la más reciente a la más antigua. */
export function consultasConExamenes(consultations: ConsultationRow[]): ConsultationRow[] {
  return consultations
    .filter((c) => (c.physical_exam ?? '').trim() !== '')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

/**
 * Histórico de resultados de estudios. Se arma con las consultas que la página ya cargó (sin
 * llamadas al servidor).
 */
export default function HistorialExamenesModal({ consultations, onClose }: {
  consultations: ConsultationRow[]
  onClose: () => void
}) {
  const filas = consultasConExamenes(consultations)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="hx-overlay" onClick={onClose}>
      <div className="hx-modal" role="dialog" aria-modal="true" aria-labelledby="hx-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="hx-cabecera">
          <h3 id="hx-titulo"><FlaskConical size={20} color="var(--primary)" aria-hidden="true" /> Histórico de exámenes</h3>
          <button type="button" className="hx-cerrar" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </div>
        {filas.length === 0 ? (
          <p className="hx-vacio">No hay resultados de estudios registrados en consultas anteriores.</p>
        ) : (
          <ol className="hx-lista">
            {filas.map((c) => {
              const doc = c.user_profiles
              return (
                <li key={c.id} className="hx-item">
                  <div className="hx-item-cabecera">
                    <strong>{formatDateLongHN(c.created_at)}</strong>
                    {doc && <span>{doctorShortName(doc.first_name, doc.last_name, doc.gender)}</span>}
                  </div>
                  <p>{c.physical_exam}</p>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
