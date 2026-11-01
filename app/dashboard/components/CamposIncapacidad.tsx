'use client'

import React, { useId } from 'react'
import { autoCrecer } from '@/utils/autoCrecer'
import { leaveEndDate, leaveSummaryText, formatYmd, MAX_LEAVE_DAYS } from '@/utils/incapacidad'

export interface LeaveValue { start: string; days: string; diagnosis: string; reason: string }
export interface ReferralValue { to: string; reason: string }

/**
 * Campos de la incapacidad médica: inicio, días calendario, último día calculado, diagnóstico de la
 * constancia e indicaciones. Controlados: los usan la consulta nueva (con borrador local) y el modal
 * «Nueva incapacidad» del expediente. El diagnóstico NO se copia solo de la consulta: el médico lo
 * escribe o toca «Usar el de la consulta» (`diagnosticoConsulta`).
 */
export function CamposIncapacidad({ value, onChange, diagnosticoConsulta }: {
  value: LeaveValue
  onChange: (v: LeaveValue) => void
  diagnosticoConsulta?: string | null
}) {
  const id = useId()
  const days = value.days ? Number(value.days) : null
  const end = leaveEndDate(value.start, days)
  const resumen = leaveSummaryText(value.start, days)
  const dxConsulta = (diagnosticoConsulta ?? '').trim()
  return (
    <>
      <div className="inc-fechas">
        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-inicio`}>Fecha de inicio <span className="evo-requerido">*</span></label>
          <input
            id={`${id}-inicio`} className="form-input" type="date" name="leave_start_date" required
            value={value.start} onChange={(e) => onChange({ ...value, start: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-dias`}>Días calendario <span className="evo-requerido">*</span></label>
          <input
            id={`${id}-dias`} className="form-input" type="number" name="leave_days" min={1} max={MAX_LEAVE_DAYS} step={1}
            placeholder="N.º" required value={value.days} onChange={(e) => onChange({ ...value, days: e.target.value })}
          />
        </div>
        <div className="form-group">
          <span className="form-label">Último día</span>
          <div className="form-input inc-calculada" aria-live="polite">{end ? formatYmd(end) : '—'}</div>
        </div>
      </div>
      <p className="inc-resumen" aria-live="polite">
        {resumen ?? 'Indica la fecha de inicio y los días calendario.'}
      </p>
      <div className="form-group">
        <div className="inc-dx-cabecera">
          <label className="form-label" htmlFor={`${id}-dx`}>Diagnóstico <span className="evo-requerido">*</span></label>
          {dxConsulta && (
            <button type="button" className="nota-clinica-accion" onClick={() => onChange({ ...value, diagnosis: dxConsulta })}>
              Usar el de la consulta
            </button>
          )}
        </div>
        <input
          id={`${id}-dx`} className="form-input" name="leave_diagnosis" required
          placeholder="Diagnóstico que justifica la incapacidad"
          value={value.diagnosis} onChange={(e) => onChange({ ...value, diagnosis: e.target.value })}
        />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" htmlFor={`${id}-motivo`}>Indicaciones <span className="evo-requerido">*</span></label>
        <textarea
          id={`${id}-motivo`} className="form-input auto-crece" name="medical_leave" rows={3} required
          placeholder="Reposo, cuidados y otras indicaciones..."
          value={value.reason} onChange={(e) => onChange({ ...value, reason: e.target.value })} onInput={autoCrecer}
        />
      </div>
    </>
  )
}

/** Campos de la referencia médica: a quién se dirige y el motivo. */
export function CamposReferencia({ value, onChange }: { value: ReferralValue; onChange: (v: ReferralValue) => void }) {
  const id = useId()
  return (
    <>
      <div className="form-group">
        <label className="form-label" htmlFor={`${id}-a`}>Dirigido a <span className="evo-requerido">*</span></label>
        <input
          id={`${id}-a`} className="form-input" name="referral_to" required
          placeholder="Especialidad, profesional o centro de atención..."
          value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
      </div>
      <span className="evo-ayuda inc-ayuda">Indica el destinatario de la referencia.</span>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" htmlFor={`${id}-motivo`}>Motivo de la referencia <span className="evo-requerido">*</span></label>
        <textarea
          id={`${id}-motivo`} className="form-input auto-crece" name="referral" rows={3} required
          placeholder="Describe el motivo y la información relevante..."
          value={value.reason} onChange={(e) => onChange({ ...value, reason: e.target.value })} onInput={autoCrecer}
        />
      </div>
    </>
  )
}

/** Panel con interruptor «Incluir»: apagado no pinta los campos, así no viajan en el formulario. */
export function PanelIncluir({ icono, titulo, incluido, onIncluir, children }: {
  icono: React.ReactNode
  titulo: string
  incluido: boolean
  onIncluir: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className="inc-panel">
      <div className="inc-panel-cabecera">
        <span className="inc-panel-icono" aria-hidden="true">{icono}</span>
        <span className="inc-panel-titulo">{titulo}</span>
        <label className="inc-switch">
          <span>Incluir</span>
          <input type="checkbox" role="switch" aria-label={`Incluir ${titulo.toLowerCase()}`} checked={incluido} onChange={(e) => onIncluir(e.target.checked)} />
          <span className="inc-switch-pista" aria-hidden="true" />
        </label>
      </div>
      {incluido && <div className="inc-panel-cuerpo">{children}</div>}
    </div>
  )
}
