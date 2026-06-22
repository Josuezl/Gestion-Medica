'use client'

import React from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { STATUS_CONFIG } from '../StatusDropdown'
import { BarChart3, Users, CalendarCheck, UserPlus, AlertTriangle } from 'lucide-react'

const PERIODS = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7', label: 'Últimos 7 días' },
  { key: '30', label: 'Últimos 30 días' },
]
const PERIOD_LABELS: Record<string, string> = { hoy: 'Hoy', '7': 'Últimos 7 días', '30': 'Últimos 30 días' }
const GENDER_COLORS: Record<string, string> = { M: '#3b82f6', F: '#ec4899', ND: '#9ca3af' }
const GENDER_LABELS: Record<string, string> = { M: 'Masculino', F: 'Femenino', ND: 'Sin definir' }

const title = (g?: string | null) => (g === 'F' ? 'Dra.' : 'Dr.')
const parseLocal = (d: string) => { const [y, m, day] = d.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, day) }
const diaLabel = (d: string) => parseLocal(d).toLocaleDateString('es-HN', { day: 'numeric', month: 'short' })
const fechaLarga = (d: string) => parseLocal(d).toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()

function Metric({ title, value, icon, accent }: { title: string; value: string | number; icon: React.ReactNode; accent: string }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '1.1rem 1.25rem' }}>
      <div style={{ width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accent}1a`, color: accent, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>{value}</div>
      </div>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>{title}</h3>
      {children}
    </div>
  )
}

const Empty = () => <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Sin datos en este periodo.</div>

export default function ReportsClient({ report, periodo, selectedDate, rpcMissing }: { report: any; periodo: string | null; selectedDate: string | null; rpcMissing: boolean }) {
  const onPickDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    window.location.href = v ? `/dashboard/reports?fecha=${v}` : '/dashboard/reports?periodo=hoy'
  }

  const Header = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Reportes</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.1rem 0 0.6rem' }}>
          Estadística operativa — {selectedDate ? fechaLarga(selectedDate) : PERIOD_LABELS[periodo || 'hoy']}
        </p>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#475569' }}>
          Ver un día específico:
          <input type="date" value={selectedDate || ''} max={todayStr} onChange={onPickDate}
                 style={{ padding: '0.35rem 0.6rem', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.82rem' }} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
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
  const noShowRate = kpis.citas > 0 ? Math.round((kpis.no_show / kpis.citas) * 100) : 0

  const porMedico = (report.por_medico || []).map((d: any) => ({ name: `${title(d.genero)} ${d.nombre}`.trim(), total: d.total }))
  const serie = (report.serie || []).map((d: any) => ({ ...d, label: diaLabel(d.dia) }))
  const lineLabels = serie.length <= 8 // con muchos puntos las etiquetas estorban
  const citasEstado = (report.citas_estado || []).map((d: any) => ({
    name: STATUS_CONFIG[d.status]?.label || d.status, total: d.total, color: STATUS_CONFIG[d.status]?.dotColor || '#94a3b8',
  }))
  const gen = report.demografia?.genero || {}
  const generoData = ['M', 'F', 'ND'].map(k => ({ k, name: GENDER_LABELS[k], total: gen[k] || 0 })).filter(d => d.total > 0)
  const edad = report.demografia?.edad || {}
  const edadData = [
    { name: 'Adultos', total: edad.adultos || 0, color: '#4f46e5' },
    { name: 'Pediátricos', total: edad.pediatricos || 0, color: '#14b8a6' },
  ].filter(d => d.total > 0)

  const pieLabel = (e: any) => `${e.value}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {Header}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        <Metric title="Consultas" value={kpis.consultas ?? 0} icon={<BarChart3 size={20} />} accent="#0d9488" />
        <Metric title="Citas" value={kpis.citas ?? 0} icon={<CalendarCheck size={20} />} accent="#4f46e5" />
        <Metric title="Pacientes nuevos" value={kpis.pacientes_nuevos ?? 0} icon={<UserPlus size={20} />} accent="#0ea5e9" />
        <Metric title="No-asistencia" value={`${noShowRate}%`} icon={<AlertTriangle size={20} />} accent="#f59e0b" />
        <Metric title="Pacientes totales" value={(kpis.pacientes_total ?? 0).toLocaleString('es-HN')} icon={<Users size={20} />} accent="#64748b" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.5rem' }}>
        <ChartCard title="Consultas por médico">
          {porMedico.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porMedico} margin={{ top: 20, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" />
                <XAxis dataKey="name" fontSize={11} interval={0} angle={-12} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.8rem' }} />
                <Bar dataKey="total" name="Consultas" fill="#0d9488" radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="total" position="top" style={{ fill: '#0f172a', fontSize: 12, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Tendencia (consultas y citas)">
          {serie.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={serie} margin={{ top: 20, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.8rem' }} />
                <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: '0.75rem' }} />
                <Line dataKey="consultas" name="Consultas" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 3 }}>
                  {lineLabels && <LabelList dataKey="consultas" position="top" style={{ fill: '#0d9488', fontSize: 11, fontWeight: 700 }} />}
                </Line>
                <Line dataKey="citas" name="Citas" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3 }}>
                  {lineLabels && <LabelList dataKey="citas" position="bottom" style={{ fill: '#4f46e5', fontSize: 11, fontWeight: 700 }} />}
                </Line>
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Citas por estado">
          {citasEstado.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={citasEstado} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} label={pieLabel} labelLine={false}>
                  {citasEstado.map((d: any, i: number) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.8rem' }} />
                <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Pacientes: demografía">
          {generoData.length === 0 && edadData.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 0.25rem' }}>Por género</p>
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={generoData} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={pieLabel} labelLine={false}>
                      {generoData.map((d: any) => <Cell key={d.k} fill={GENDER_COLORS[d.k]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.8rem' }} />
                    <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 0.25rem' }}>Adultos vs pediátricos</p>
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={edadData} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={pieLabel} labelLine={false}>
                      {edadData.map((d: any, i: number) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.8rem' }} />
                    <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
