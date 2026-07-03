'use client'

import React, { useState } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { STATUS_CONFIG } from '../StatusDropdown'
import { createClient } from '@/utils/supabase/client'
import { BarChart3, Users, CalendarCheck, UserPlus, AlertTriangle, X, Loader2, Download } from 'lucide-react'

const PERIODS = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7', label: 'Últimos 7 días' },
  { key: '30', label: 'Últimos 30 días' },
]
const PERIOD_LABELS: Record<string, string> = { hoy: 'Hoy', '7': 'Últimos 7 días', '30': 'Últimos 30 días' }
const GENDER_COLORS: Record<string, string> = { M: '#3b82f6', F: '#ec4899', ND: '#9ca3af' }
const GENDER_LABELS: Record<string, string> = { M: 'Masculino', F: 'Femenino', ND: 'Sin definir' }

const DETAIL_COLS: Record<string, { key: string; label: string }[]> = {
  consultas: [{ key: 'fecha', label: 'Fecha' }, { key: 'paciente', label: 'Paciente' }, { key: 'medico', label: 'Médico' }, { key: 'especialidad', label: 'Especialidad' }],
  citas: [{ key: 'fecha', label: 'Fecha' }, { key: 'paciente', label: 'Paciente' }, { key: 'medico', label: 'Médico' }, { key: 'especialidad', label: 'Especialidad' }, { key: 'estado', label: 'Estado' }],
  no_show: [{ key: 'fecha', label: 'Fecha' }, { key: 'paciente', label: 'Paciente' }, { key: 'medico', label: 'Médico' }, { key: 'especialidad', label: 'Especialidad' }],
  pacientes_nuevos: [{ key: 'fecha', label: 'Fecha' }, { key: 'paciente', label: 'Paciente' }, { key: 'expediente', label: 'N° Expediente' }, { key: 'creado_por', label: 'Creado por' }],
}

/** Forma del JSON que devuelve el RPC clinic_report. */
export interface ClinicReport {
  error?: string
  kpis?: {
    consultas?: number
    citas?: number
    no_show?: number
    pacientes_nuevos?: number
    pacientes_total?: number
  }
  por_medico?: { nombre: string; genero?: string | null; total: number }[]
  por_especialidad?: { especialidad: string; total: number }[]
  citas_estado?: { status: string; total: number }[]
  demografia?: {
    genero?: Record<string, number>
    edad?: { adultos?: number; pediatricos?: number }
  }
}

/** Fila del RPC clinic_report_detail (columnas variables según el tipo de detalle). */
type DetailRow = Record<string, string | number | null>

const title = (g?: string | null) => (g === 'F' ? 'Dra.' : 'Dr.')
const parseLocal = (d: string) => { const [y, m, day] = d.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, day) }
const fechaLarga = (d: string) => parseLocal(d).toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
// 'YYYY-MM-DDTHH:MM:SS' (hora local de la BD) → 'DD/MM/YYYY HH:MM' sin reinterpretar zona horaria.
const fmtFecha = (s: string) => {
  if (!s) return '—'
  const [d, t] = String(s).split('T')
  const [y, m, day] = (d || '').split('-')
  const hm = (t || '').slice(0, 5)
  return day ? `${day}/${m}/${y}${hm ? ' ' + hm : ''}` : String(s)
}

function Metric({ title, value, icon, accent, onClick }: { title: string; value: string | number; icon: React.ReactNode; accent: string; onClick?: () => void }) {
  return (
    <div className="card" onClick={onClick} title={onClick ? 'Ver detalle' : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '1.1rem 1.25rem', cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow .15s, transform .15s' }}
      onMouseEnter={onClick ? (e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 18px rgba(15,23,42,0.12)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)' } : undefined}
      onMouseLeave={onClick ? (e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = ''; (e.currentTarget as HTMLDivElement).style.transform = '' } : undefined}>
      <div style={{ width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accent}1a`, color: accent, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>{value}</div>
        {onClick && <div style={{ fontSize: '0.7rem', color: accent, fontWeight: 700, marginTop: '0.2rem' }}>Click para ver detalle →</div>}
      </div>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem' }}>{title}</h3>
      {children}
    </div>
  )
}

const Empty = () => <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Sin datos en este periodo.</div>

export default function ReportsClient({ report, periodo, selectedDate, rpcMissing }: { report: ClinicReport | null; periodo: string | null; selectedDate: string | null; rpcMissing: boolean }) {
  const supabase = createClient()
  const days = periodo === '30' ? 30 : periodo === '7' ? 7 : 1
  const [detail, setDetail] = useState<{ tipo: string; label: string; rows: DetailRow[] | null } | null>(null)

  const openDetail = async (tipo: string, label: string) => {
    setDetail({ tipo, label, rows: null })
    const { data } = await supabase.rpc('clinic_report_detail', { p_tipo: tipo, p_days: days, p_date: selectedDate })
    setDetail({ tipo, label, rows: Array.isArray(data) ? data : [] })
  }

  // Exporta el detalle visible a un CSV (con BOM UTF-8) que abre en Excel.
  const downloadExcel = () => {
    if (!detail?.rows?.length) return
    const c = DETAIL_COLS[detail.tipo] || []
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const cell = (r: DetailRow, key: string) =>
      key === 'fecha' ? fmtFecha(String(r.fecha ?? ''))
        : key === 'estado' ? (STATUS_CONFIG[String(r.estado ?? '')]?.label || r.estado)
        : (r[key] ?? '')
    const csv = '﻿' + [
      c.map(x => esc(x.label)).join(','),
      ...detail.rows.map((r) => c.map(x => esc(cell(r, x.key))).join(',')),
    ].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${detail.label}_${selectedDate || PERIOD_LABELS[periodo || 'hoy']}.csv`.replace(/[\s/]+/g, '_')
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  const onPickDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    window.location.href = v ? `/dashboard/reports?fecha=${v}` : '/dashboard/reports?periodo=hoy'
  }

  const Header = (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Reportes</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.1rem 0 0.7rem' }}>
        Estadística operativa — {selectedDate ? fechaLarga(selectedDate) : PERIOD_LABELS[periodo || 'hoy']}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        {PERIODS.map(p => {
          const active = !selectedDate && periodo === p.key
          return (
            <a key={p.key} href={`/dashboard/reports?periodo=${p.key}`}
               style={{ padding: '0.4rem 0.9rem', borderRadius: 999, fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none',
                 background: active ? 'var(--primary)' : '#f1f5f9', color: active ? '#fff' : '#475569', border: '1px solid', borderColor: active ? 'var(--primary)' : '#e2e8f0' }}>
              {p.label}
            </a>
          )
        })}
        <span style={{ color: '#cbd5e1', margin: '0 0.15rem' }}>|</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', color: '#475569' }}>
          Día específico:
          <input type="date" value={selectedDate || ''} max={todayStr} onChange={onPickDate}
                 style={{ padding: '0.35rem 0.6rem', borderRadius: 999, border: '1px solid', borderColor: selectedDate ? 'var(--primary)' : '#e2e8f0', fontSize: '0.82rem', color: selectedDate ? 'var(--primary)' : '#475569', fontWeight: 600 }} />
        </label>
      </div>
    </div>
  )

  if (rpcMissing || !report || report.error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {Header}
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
          <BarChart3 size={28} style={{ marginBottom: '0.5rem', opacity: 0.6 }} />
          <p style={{ margin: 0 }}>Configurando reportes… (la función de estadísticas aún no está disponible).</p>
        </div>
      </div>
    )
  }

  const kpis = report.kpis || {}
  const citasTotal = kpis.citas ?? 0
  const noShowRate = citasTotal > 0 ? Math.round(((kpis.no_show ?? 0) / citasTotal) * 100) : 0

  const porMedico = (report.por_medico || []).map((d) => ({ name: `${title(d.genero)} ${d.nombre}`.trim(), total: d.total }))
  const porEspecialidad = (report.por_especialidad || []).map((d) => ({ name: d.especialidad, total: d.total }))
  const citasEstado = (report.citas_estado || []).map((d) => ({
    name: STATUS_CONFIG[d.status]?.label || d.status, total: d.total, color: STATUS_CONFIG[d.status]?.dotColor || '#94a3b8',
  }))
  const gen = report.demografia?.genero || {}
  const generoData = ['M', 'F', 'ND'].map(k => ({ k, name: GENDER_LABELS[k], total: gen[k] || 0 })).filter(d => d.total > 0)
  const edad = report.demografia?.edad || {}
  const edadData = [
    { name: 'Adultos', total: edad.adultos || 0, color: '#4f46e5' },
    { name: 'Pediátricos', total: edad.pediatricos || 0, color: '#14b8a6' },
  ].filter(d => d.total > 0)

  const pieLabel = (e: { value?: number | string }) => `${e.value}`
  const cols = detail ? DETAIL_COLS[detail.tipo] || [] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {Header}

      {/* KPIs — clickeables: abren el detalle de lo que cuentan */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        <Metric title="Consultas" value={kpis.consultas ?? 0} icon={<BarChart3 size={20} />} accent="#0d9488" onClick={() => openDetail('consultas', 'Consultas')} />
        <Metric title="Citas" value={kpis.citas ?? 0} icon={<CalendarCheck size={20} />} accent="#4f46e5" onClick={() => openDetail('citas', 'Citas')} />
        <Metric title="Pacientes nuevos" value={kpis.pacientes_nuevos ?? 0} icon={<UserPlus size={20} />} accent="#0ea5e9" onClick={() => openDetail('pacientes_nuevos', 'Pacientes nuevos')} />
        <Metric title="No-asistencia" value={`${noShowRate}%`} icon={<AlertTriangle size={20} />} accent="#f59e0b" onClick={() => openDetail('no_show', 'Citas no asistidas')} />
        <Metric title="Pacientes totales" value={(kpis.pacientes_total ?? 0).toLocaleString('es-HN')} icon={<Users size={20} />} accent="#64748b" onClick={() => { window.location.href = '/dashboard/patients' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '1.5rem' }}>
        <ChartCard title="Consultas por médico">
          {porMedico.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={porMedico} margin={{ top: 24, right: 24, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" />
                <XAxis dataKey="name" fontSize={12} interval={0} angle={-12} textAnchor="end" height={56} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.8rem' }} />
                <Bar dataKey="total" name="Consultas" fill="#0d9488" radius={[6, 6, 0, 0]} maxBarSize={90}>
                  <LabelList dataKey="total" position="top" style={{ fill: '#0f172a', fontSize: 13, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Pacientes atendidos por especialidad">
          {porEspecialidad.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={porEspecialidad} margin={{ top: 24, right: 24, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" />
                <XAxis dataKey="name" fontSize={12} interval={0} angle={-12} textAnchor="end" height={56} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.8rem' }} />
                <Bar dataKey="total" name="Pacientes" fill="#4f46e5" radius={[6, 6, 0, 0]} maxBarSize={90}>
                  <LabelList dataKey="total" position="top" style={{ fill: '#0f172a', fontSize: 13, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Citas por estado">
          {citasEstado.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={340}>
              <PieChart>
                <Pie data={citasEstado} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={115} paddingAngle={2} label={pieLabel} labelLine={false}>
                  {citasEstado.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.8rem' }} />
                <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Pacientes: demografía">
          {generoData.length === 0 && edadData.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 0.25rem', fontWeight: 600 }}>Por género</p>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={generoData} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={pieLabel} labelLine={false}>
                      {generoData.map((d) => <Cell key={d.k} fill={GENDER_COLORS[d.k]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.8rem' }} />
                    <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 0.25rem', fontWeight: 600 }}>Adultos vs pediátricos</p>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={edadData} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={pieLabel} labelLine={false}>
                      {edadData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.8rem' }} />
                    <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Modal de detalle del KPI */}
      {detail && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
             onClick={() => setDetail(null)}>
          <div className="card" style={{ maxWidth: 640, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                {detail.label} <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.85rem' }}>· {selectedDate ? fechaLarga(selectedDate) : PERIOD_LABELS[periodo || 'hoy']}</span>
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {detail.rows && detail.rows.length > 0 && (
                  <button onClick={downloadExcel} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.7rem', fontSize: '0.8rem' }} title="Descargar en Excel (CSV)">
                    <Download size={15} /> Exportar a Excel
                  </button>
                )}
                <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} title="Cerrar"><X size={20} /></button>
              </div>
            </div>
            {detail.rows === null ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>
            ) : detail.rows.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>Sin registros en este periodo.</div>
            ) : (
              <div style={{ overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                      {cols.map(c => <th key={c.key} style={{ padding: '0.5rem 0.6rem', position: 'sticky', top: 0, background: '#fff' }}>{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        {cols.map(c => (
                          <td key={c.key} style={{ padding: '0.5rem 0.6rem' }}>
                            {c.key === 'fecha' ? fmtFecha(String(r.fecha ?? ''))
                              : c.key === 'estado' ? (STATUS_CONFIG[String(r.estado ?? '')]?.label || r.estado)
                              : (r[c.key] || '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {detail.rows.length >= 500 && (
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.5rem' }}>Mostrando los 500 más recientes.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
