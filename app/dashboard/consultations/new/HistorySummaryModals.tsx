'use client'

import React, { useState } from 'react'
import { ClipboardList, BarChart3, ArrowRight } from 'lucide-react'
import { calculateAge } from '@/utils/age'
import { summaryHeadline, aggregateDiagnoses, summarizeRecentConsultations } from '@/utils/historySummary'
import type { ConsultationRow, PatientRow } from '@/utils/clinicalTypes'
import nextDynamic from 'next/dynamic'
// recharts pesa ~100 KB gz y el gráfico vive dentro de un modal: se difiere (P2-5)
const DiagnosesBarChart = nextDynamic(() => import('./DiagnosesBarChart'), { ssr: false, loading: () => <p style={{ color: 'var(--text-muted)', padding: '1rem' }}>Cargando gráfica…</p> })

const RECENT_LIMIT = 5

/**
 * Al iniciar una consulta de un paciente con historial, muestra automáticamente un modal bloqueante
 * con el reporte de sus últimas consultas y un gráfico de diagnósticos. El médico lo descarta con
 * "Continuar con consulta". Todo se arma desde las consultas ya cargadas (sin llamadas externas).
 */
export default function HistorySummaryModals({ patient, consultations }: {
  patient: Pick<PatientRow, 'gender' | 'birth_date' | 'first_name' | 'last_name'>
  consultations: ConsultationRow[]
}) {
  const [open, setOpen] = useState(true)

  if (!open || consultations.length === 0) return null

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem', boxSizing: 'border-box',
  }

  const age = calculateAge(patient.birth_date)
  const intro = `${summaryHeadline(patient.first_name, patient.last_name, patient.gender, age)} que en sus últimas consultas se reporta lo siguiente:`
  const recent = summarizeRecentConsultations(consultations, RECENT_LIMIT)
  const diagnoses = aggregateDiagnoses(consultations)

  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  return (
    <div style={overlay}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', padding: '24px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardList size={20} color="var(--primary)" /> Resumen del Expediente
          </h3>
          <button type="button" className="btn btn-primary" style={{ gap: '0.4rem' }} onClick={() => setOpen(false)}>
            Continuar con la consulta <ArrowRight size={16} />
          </button>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: '0.95rem', color: '#0f172a', lineHeight: 1.5, fontWeight: 500 }}>
          {intro}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          {recent.map((c, i) => (
            <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px', background: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, color: '#0f766e', fontSize: '0.9rem', textTransform: 'capitalize' }}>{fmtDate(c.date)}</span>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{c.doctorName}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Field label="Diagnóstico" value={c.diagnosis} />
                <Field label="Síntomas" value={c.symptoms} />
                <Field label="Plan de tratamiento" value={c.plan} />
              </div>
            </div>
          ))}
        </div>

        {diagnoses.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
              <BarChart3 size={16} color="var(--primary)" /> Diagnósticos más frecuentes
            </div>
            <DiagnosesBarChart data={diagnoses} />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-primary" style={{ gap: '0.4rem' }} onClick={() => setOpen(false)}>
            Continuar con la consulta <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px' }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '0.85rem', color: value ? '#334155' : '#cbd5e1', lineHeight: 1.45 }}>{value || 'No registrado'}</div>
    </div>
  )
}
