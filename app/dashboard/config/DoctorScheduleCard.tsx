'use client'

import React, { useState } from 'react'
import { saveDoctorSchedule } from './actions'
import { validateScheduleRanges, type EditableScheduleRange } from '@/utils/booking'
import { doctorShortName } from '@/utils/doctorName'
import { CalendarClock, Plus, Loader2, Trash2, Check } from 'lucide-react'

const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
// Orden de despliegue: lunes primero (semana laboral), domingo al final.
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

interface ScheduleRow {
  id: string
  doctor_id: string
  location_id: string | null
  weekday: number
  start_time: string
  end_time: string
}

/**
 * Tarjeta de Configuración: horario semanal por médico para el portal público de
 * auto-agendamiento. Define en qué días/horas el portal ofrece slots de 1 hora.
 * Si la clínica tiene sedes, cada médico puede tener un horario por sede además del
 * "Horario general": el portal usa el de la sede del link, y si no existe cae al general.
 * No afecta la agenda interna (el staff puede agendar a cualquier hora).
 */
export default function DoctorScheduleCard({ doctors, schedules, locations }: { doctors: any[]; schedules: ScheduleRow[]; locations: any[] }) {
  const activeLocations = locations.filter((l: any) => l.is_active)
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(doctors[0]?.id || '')
  // '' = horario general (location_id NULL); un id = horario propio de esa sede.
  const [selectedLocationId, setSelectedLocationId] = useState<string>('')
  const [editing, setEditing] = useState<EditableScheduleRange[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const toHHMM = (t: string) => t.slice(0, 5)
  const savedRanges = (doctorId: string, locationId: string): EditableScheduleRange[] =>
    schedules
      .filter(s => s.doctor_id === doctorId && (s.location_id ?? '') === locationId)
      .map(s => ({ weekday: s.weekday, start: toHHMM(s.start_time), end: toHHMM(s.end_time) }))

  // Rangos mostrados: los que se están editando, o los guardados del médico+sede seleccionados.
  const ranges = editing ?? savedRanges(selectedDoctorId, selectedLocationId)

  // Aviso de fallback: la sede seleccionada no tiene horario propio pero el médico sí tiene general.
  const usesGeneralFallback = selectedLocationId !== '' && editing === null && ranges.length === 0 &&
    savedRanges(selectedDoctorId, '').length > 0

  const startEditing = () => { setEditing([...ranges]); setSaved(false); setError(null) }

  // Siempre con functional update: varios clicks en el mismo batch de React (p. ej. agregar
  // rangos rápido) comparten el closure y con `[...editing, ...]` solo sobreviviría el último.
  // Actualizar/quitar por IDENTIDAD del objeto, nunca por índice: los índices capturados en el
  // render quedan obsoletos cuando varios clicks caen en el mismo batch (quitar dos rangos rápido
  // borraría filas equivocadas al correrse las posiciones).
  const updateRange = (target: EditableScheduleRange, patch: Partial<EditableScheduleRange>) => {
    setEditing(prev => prev ? prev.map(r => (r === target ? { ...r, ...patch } : r)) : prev)
  }

  const addRange = (weekday: number) => {
    setEditing(prev => prev ? [...prev, { weekday, start: '08:00', end: '12:00' }] : prev)
  }

  const removeRange = (target: EditableScheduleRange) => {
    setEditing(prev => prev ? prev.filter(r => r !== target) : prev)
  }

  const rangesOfDay = (weekday: number) => ranges
    .filter(r => r.weekday === weekday)
    .sort((a, b) => a.start.localeCompare(b.start))

  const handleSave = async () => {
    if (!editing) return
    const validationError = validateScheduleRanges(editing)
    if (validationError) { setError(validationError); return }
    setError(null)
    setBusy(true)
    const res = await saveDoctorSchedule(selectedDoctorId, selectedLocationId || null, editing)
    setBusy(false)
    if (res?.error) { setError(res.error); return }
    setEditing(null)
    setSaved(true)
  }

  if (doctors.length === 0) return null

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <CalendarClock size={20} color="var(--primary)" />
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Horario para agenda pública</h3>
      </div>
      <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        Días y horas en que los pacientes pueden agendar solos desde el enlace público (citas de 1 hora).
        Si un médico no tiene horario, su enlace no ofrecerá ninguna fecha. La agenda interna no se ve afectada.
        {activeLocations.length > 0 && (
          <> Cada médico puede tener un horario distinto por clínica; si una clínica no tiene horario propio,
          su enlace usa el <strong>horario general</strong> del médico.</>
        )}
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select
          className="form-input"
          value={selectedDoctorId}
          onChange={e => { setSelectedDoctorId(e.target.value); setEditing(null); setError(null); setSaved(false) }}
          style={{ minWidth: '220px', maxWidth: '320px' }}
        >
          {doctors.map((d: any) => (
            <option key={d.id} value={d.id}>{doctorShortName(d.first_name, d.last_name, d.gender)}</option>
          ))}
        </select>
        {activeLocations.length > 0 && (
          <select
            className="form-input"
            value={selectedLocationId}
            onChange={e => { setSelectedLocationId(e.target.value); setEditing(null); setError(null); setSaved(false) }}
            style={{ minWidth: '180px', maxWidth: '280px' }}
          >
            <option value="">Horario general</option>
            {activeLocations.map((l: any) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}
        {editing === null ? (
          <button className="btn btn-secondary" onClick={startEditing}>Editar horario</button>
        ) : (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={handleSave} style={{ gap: '0.35rem' }}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Guardar
            </button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => { setEditing(null); setError(null) }}>Cancelar</button>
          </>
        )}
        {saved && <span style={{ color: 'var(--primary)', fontSize: '0.85rem', fontWeight: 600 }}>Horario guardado.</span>}
      </div>

      {error && (
        <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {usesGeneralFallback && (
        <div style={{ padding: '0.65rem 0.75rem', background: '#f0fdfa', border: '1px solid #99f6e4', color: '#115e59', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
          Esta clínica no tiene horario propio: su enlace público usa el <strong>horario general</strong> del médico.
          Edita y guarda aquí solo si quieres un horario distinto para esta clínica.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
        {WEEKDAY_ORDER.map(weekday => (
          <div key={weekday} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.75rem', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{WEEKDAY_LABELS[weekday]}</span>
              {editing !== null && (
                <button
                  title="Agregar rango"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)' }}
                  onClick={() => addRange(weekday)}
                >
                  <Plus size={16} />
                </button>
              )}
            </div>
            {rangesOfDay(weekday).length === 0 ? (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sin atención</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {rangesOfDay(weekday).map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                    {editing !== null ? (
                      <>
                        <input type="time" className="form-input" value={r.start} onChange={e => updateRange(r, { start: e.target.value })} style={{ padding: '0.25rem 0.4rem', fontSize: '0.82rem' }} />
                        <span>–</span>
                        <input type="time" className="form-input" value={r.end} onChange={e => updateRange(r, { end: e.target.value })} style={{ padding: '0.25rem 0.4rem', fontSize: '0.82rem' }} />
                        <button
                          title="Quitar rango"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}
                          onClick={() => removeRange(r)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : (
                      <span>{r.start} – {r.end}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
