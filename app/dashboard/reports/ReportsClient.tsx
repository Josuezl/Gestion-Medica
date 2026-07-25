'use client'

import React, { useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { STATUS_CONFIG } from '../StatusDropdown'
import { createClient } from '@/utils/supabase/client'
import {
  BarChart3, Users, CalendarCheck, UserPlus, AlertTriangle, X, Loader2, Download,
} from 'lucide-react'

const PERIODS = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7', label: 'Últimos 7 días' },
  { key: '30', label: 'Últimos 30 días' },
]
const PERIOD_LABELS: Record<string, string> = { hoy: 'Hoy', '7': 'Últimos 7 días', '30': 'Últimos 30 días' }

// Series de datos (validadas con el validador de paletas: contraste ≥3:1 y separación CVD).
const C_TEAL = '#0d9488'
const C_INDIGO = '#4f46e5'
const GENDER_SEGS: { k: string; label: string; color: string }[] = [
  { k: 'M', label: 'Masculino', color: '#3b82f6' },
  { k: 'F', label: 'Femenino', color: '#db2777' },
  { k: 'ND', label: 'Sin definir', color: '#94a3b8' },
]
// Orden fijo del desglose de estados: de "atendida" hacia "perdida".
const STATUS_ORDER = ['COMPLETED', 'IN_PROGRESS', 'WAITING', 'CONFIRMED', 'PENDING', 'PENDING_REVIEW', 'CANCELLED', 'NO_SHOW']

const DETAIL_COLS: Record<string, { key: string; label: string }[]> = {
  consultas: [{ key: 'fecha', label: 'Fecha' }, { key: 'paciente', label: 'Paciente' }, { key: 'medico', label: 'Médico' }, { key: 'especialidad', label: 'Especialidad' }],
  citas: [{ key: 'fecha', label: 'Fecha' }, { key: 'paciente', label: 'Paciente' }, { key: 'medico', label: 'Médico' }, { key: 'especialidad', label: 'Especialidad' }, { key: 'estado', label: 'Estado' }],
  no_show: [{ key: 'fecha', label: 'Fecha' }, { key: 'paciente', label: 'Paciente' }, { key: 'medico', label: 'Médico' }, { key: 'especialidad', label: 'Especialidad' }],
  pacientes_nuevos: [{ key: 'fecha', label: 'Fecha' }, { key: 'paciente', label: 'Paciente' }, { key: 'expediente', label: 'N° Expediente' }, { key: 'creado_por', label: 'Creado por' }],
}

/** Forma del JSON que devuelve el RPC clinic_report (v2: serie_diaria, citas_hora y kpis_prev son opcionales). */
export interface ClinicReport {
  error?: string
  rango?: { desde?: string; hasta?: string }
  kpis?: {
    consultas?: number
    citas?: number
    no_show?: number
    pacientes_nuevos?: number
    pacientes_total?: number
  }
  kpis_prev?: {
    consultas?: number
    citas?: number
    no_show?: number
    pacientes_nuevos?: number
  }
  por_medico?: { nombre: string; genero?: string | null; total: number }[]
  por_especialidad?: { especialidad: string; total: number }[]
  citas_estado?: { status: string; total: number }[]
  serie_diaria?: { fecha: string; consultas: number; citas: number; nuevos?: number; no_show?: number }[]
  citas_hora?: { hora: number; total: number }[]
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
const fmtHora = (h: number) => (h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`)
const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0)

/* ------------------------------------------------------------------ */
/* Piezas visuales                                                     */
/* ------------------------------------------------------------------ */

/** Mini-tendencia del periodo: área con relleno suave anclada al borde inferior de la caja.
 *  baseline 'min' es para métricas acumuladas (p.ej. pacientes totales), donde interesa la forma. */
function Sparkline({ points, accent, baseline = 'zero' }: { points: number[]; accent: string; baseline?: 'zero' | 'min' }) {
  if (points.length < 2) return null
  const w = 100, h = 34
  const min = baseline === 'min' ? Math.min(...points) : 0
  const max = Math.max(...points)
  const x = (i: number) => (i * w) / (points.length - 1)
  const y = (v: number) => (max === min ? h / 2 : 3 + (h - 6) * (1 - (v - min) / (max - min)))
  const line = points.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" style={{ width: '100%', height: 34, display: 'block' }}>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={accent} fillOpacity={0.12} stroke="none" />
      <polyline points={line} fill="none" stroke={accent} strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function StatTile({ label, value, icon, accent, spark, sparkBaseline, onClick }: {
  label: string; value: string | number; icon: React.ReactNode; accent: string
  spark?: number[]; sparkBaseline?: 'zero' | 'min'; onClick?: () => void
}) {
  return (
    <button type="button" className="card rpt-tile" onClick={onClick} title="Ver detalle" style={{ padding: '1.05rem 1.15rem', overflow: 'hidden' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `${accent}1a`, color: accent, flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b' }}>{label}</span>
      </span>
      <span style={{ fontSize: '1.7rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.05, fontFamily: 'var(--font-display)' }}>{value}</span>
      {spark && spark.length > 1 ? (
        // Sangra hasta los bordes de la tarjeta para que el área quede al ras, como fondo del pie.
        <span style={{ display: 'block', margin: 'auto -1.15rem -1.05rem', paddingTop: '0.35rem' }}>
          <Sparkline points={spark} accent={accent} baseline={sparkBaseline} />
        </span>
      ) : null}
    </button>
  )
}

function ChartCard({ title, kicker, span, children }: { title: string; kicker?: string; span?: boolean; children: React.ReactNode }) {
  return (
    <section className={`card${span ? ' rpt-span' : ''}`} style={{ padding: '1.35rem 1.5rem', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1.1rem', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>{title}</h3>
        {kicker && <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>{kicker}</span>}
      </header>
      {children}
    </section>
  )
}

const Empty = ({ h = 200 }: { h?: number }) => (
  <div style={{ height: h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#94a3b8', fontSize: '0.85rem' }}>
    <BarChart3 size={22} style={{ opacity: 0.5 }} />
    Sin datos en este periodo.
  </div>
)

/** Ranking horizontal: barras finas con la etiqueta y el valor directamente legibles. */
function RankBars({ data, color }: { data: { name: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {data.map(d => (
        <div key={d.name}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem', marginBottom: 4 }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>{d.value}</span>
          </div>
          <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${(d.value / max) * 100}%`, height: '100%', background: color, borderRadius: '0 4px 4px 0' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Columnas verticales con etiqueta de valor arriba y nombres rotados (estilo pedido por los
 *  médicos para "Consultas por médico"). Serie única → sin leyenda; el título nombra la métrica.
 *  isAnimationActive={false}: sin esto, recharts + React 19 no pinta las barras. */
function ColumnChart({ data, color }: { data: { name: string; value: number }[]; color: string }) {
  const sorted = data.slice().sort((a, b) => b.value - a.value)
  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={sorted} margin={{ top: 24, right: 8, left: 0, bottom: 4 }} barCategoryGap="22%">
        <CartesianGrid stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="name" interval={0} height={92} tickLine={false} axisLine={{ stroke: '#e2e8f0' }}
          angle={-35} textAnchor="end" tick={{ fontSize: 11, fill: '#475569' }}
        />
        <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} width={30} tick={{ fill: '#94a3b8' }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: `${color}14` }} formatter={(v: number) => [v, 'Consultas']} />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={70} isAnimationActive={false}>
          <LabelList dataKey="value" position="top" style={{ fill: '#0f172a', fontSize: 12, fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Barra de proporción (parte-del-todo) con leyenda de conteos y porcentajes. */
function PropBar({ label, segments, legend = 'wrap' }: {
  label?: string
  segments: { label: string; value: number; color: string }[]
  legend?: 'wrap' | 'rows'
}) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const vis = segments.filter(s => s.value > 0)
  if (total === 0 || vis.length === 0) return <Empty h={120} />
  return (
    <div>
      {label && <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>{label}</p>}
      <div role="img" aria-label={`${label || 'Distribución'}: ${vis.map(s => `${s.label} ${s.value} (${pct(s.value, total)}%)`).join(', ')}`}
           style={{ display: 'flex', gap: 2, height: 14, borderRadius: 7, overflow: 'hidden' }}>
        {vis.map(s => (
          <div key={s.label} title={`${s.label}: ${s.value} (${pct(s.value, total)}%)`}
               style={{ width: `${(s.value / total) * 100}%`, minWidth: 4, background: s.color }} />
        ))}
      </div>
      {legend === 'wrap' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 1.1rem', marginTop: '0.65rem' }}>
          {vis.map(s => (
            <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#475569' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              {s.label} <strong style={{ color: '#0f172a' }}>{s.value.toLocaleString('es-HN')}</strong>
              <span style={{ color: '#94a3b8' }}>({pct(s.value, total)}%)</span>
            </span>
          ))}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: '0.75rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {vis.map(s => (
            <li key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: '#334155' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
              <strong style={{ color: '#0f172a' }}>{s.value.toLocaleString('es-HN')}</strong>
              <span style={{ color: '#94a3b8', width: 42, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct(s.value, total)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  boxShadow: '0 8px 24px rgba(15,23,42,0.10)',
  fontSize: '0.8rem',
  background: '#ffffff',
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

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
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.1rem 0 0.8rem' }}>
        Estadística operativa — {selectedDate ? fechaLarga(selectedDate) : PERIOD_LABELS[periodo || 'hoy']}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <nav className="rpt-period-group" aria-label="Periodo del reporte">
          {PERIODS.map(p => {
            const active = !selectedDate && periodo === p.key
            return (
              <a key={p.key} href={`/dashboard/reports?periodo=${p.key}`} className={`rpt-period${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
                {p.label}
              </a>
            )
          })}
        </nav>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', color: '#475569' }}>
          Día específico:
          <input type="date" value={selectedDate || ''} max={todayStr} onChange={onPickDate}
                 style={{ padding: '0.35rem 0.6rem', borderRadius: 999, border: '1px solid', borderColor: selectedDate ? 'var(--primary)' : '#e2e8f0', fontSize: '0.82rem', color: selectedDate ? 'var(--primary)' : '#475569', fontWeight: 600, background: '#fff' }} />
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

  // Serie diaria (tendencia + sparklines). Desde el RPC v3 cubre al menos 7 días
  // aunque el periodo sea "Hoy", para que los KPIs siempre muestren su mini-tendencia.
  const serie = report.serie_diaria || []
  const hasSerie = serie.length > 1
  const sparkConsultas = hasSerie ? serie.map(d => d.consultas) : undefined
  const sparkCitas = hasSerie ? serie.map(d => d.citas) : undefined
  // 'nuevos' y 'no_show' por día existen desde el RPC v3; si faltan, esos KPIs van sin mini-tendencia.
  const hasSerieV3 = hasSerie && serie.some(d => typeof d.nuevos === 'number')
  const sparkNuevos = hasSerieV3 ? serie.map(d => d.nuevos ?? 0) : undefined
  const sparkNoShow = hasSerieV3 ? serie.map(d => d.no_show ?? 0) : undefined
  // Pacientes totales: acumulado reconstruido hacia atrás desde el total actual.
  let sparkTotal: number[] | undefined
  if (hasSerieV3) {
    const acc: number[] = new Array(serie.length)
    let t = kpis.pacientes_total ?? 0
    for (let i = serie.length - 1; i >= 0; i--) { acc[i] = t; t -= serie[i].nuevos ?? 0 }
    sparkTotal = acc
  }

  // Citas por hora del día (horas pico) — huecos rellenados con 0 para una escala continua.
  const horas = report.citas_hora || []
  const horasData: { hora: string; Citas: number }[] = []
  let horaPico: string | undefined
  if (horas.length > 0) {
    const hMin = Math.min(...horas.map(h => h.hora))
    const hMax = Math.max(...horas.map(h => h.hora))
    const byHour = new Map(horas.map(h => [h.hora, h.total]))
    for (let h = hMin; h <= hMax; h++) horasData.push({ hora: fmtHora(h), Citas: byHour.get(h) ?? 0 })
    const peak = horas.reduce((a, b) => (b.total > a.total ? b : a))
    horaPico = `Hora pico: ${fmtHora(peak.hora)}`
  }

  const porMedico = (report.por_medico || []).map((d) => ({ name: `${title(d.genero)} ${d.nombre}`.trim(), value: d.total }))
  const porEspecialidad = (report.por_especialidad || []).map((d) => ({ name: d.especialidad, value: d.total }))

  // Desglose de citas por estado, en orden fijo "atendida → perdida".
  const estadoSegs = (report.citas_estado || [])
    .slice()
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
    .map(d => ({ label: STATUS_CONFIG[d.status]?.label || d.status, value: d.total, color: STATUS_CONFIG[d.status]?.dotColor || '#94a3b8' }))
  const realizadas = (report.citas_estado || []).find(d => d.status === 'COMPLETED')?.total ?? 0
  const kickerEstado = citasTotal > 0 ? `${pct(realizadas, citasTotal)}% realizadas` : undefined

  const gen = report.demografia?.genero || {}
  const generoSegs = GENDER_SEGS.map(g => ({ label: g.label, value: gen[g.k] || 0, color: g.color }))
  const edad = report.demografia?.edad || {}
  const edadSegs = [
    { label: 'Adultos', value: edad.adultos || 0, color: C_INDIGO },
    { label: 'Pediátricos', value: edad.pediatricos || 0, color: C_TEAL },
  ]
  const totalPacientes = (kpis.pacientes_total ?? 0).toLocaleString('es-HN')
  // Kicker con el grupo dominante (p.ej. "52% femenino").
  const dominante = (segs: { label: string; value: number }[]) => {
    const total = segs.reduce((s, x) => s + x.value, 0)
    if (total === 0) return undefined
    const top = segs.reduce((a, b) => (b.value > a.value ? b : a))
    return `${pct(top.value, total)}% ${top.label.toLowerCase()}`
  }
  const kickerGenero = dominante(generoSegs)
  const kickerEdad = dominante(edadSegs)

  const cols = detail ? DETAIL_COLS[detail.tipo] || [] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {Header}

      {/* KPIs — clickeables: abren el detalle de lo que cuentan */}
      <div className="rpt-kpi-grid">
        <StatTile label="Consultas" value={kpis.consultas ?? 0} icon={<BarChart3 size={17} />} accent={C_TEAL} spark={sparkConsultas} onClick={() => openDetail('consultas', 'Consultas')} />
        <StatTile label="Citas" value={kpis.citas ?? 0} icon={<CalendarCheck size={17} />} accent={C_INDIGO} spark={sparkCitas} onClick={() => openDetail('citas', 'Citas')} />
        <StatTile label="Pacientes nuevos" value={(kpis.pacientes_nuevos ?? 0).toLocaleString('es-HN')} icon={<UserPlus size={17} />} accent="#0ea5e9" spark={sparkNuevos} onClick={() => openDetail('pacientes_nuevos', 'Pacientes nuevos')} />
        <StatTile label="No-asistencia" value={`${noShowRate}%`} icon={<AlertTriangle size={17} />} accent="#d97706" spark={sparkNoShow} onClick={() => openDetail('no_show', 'Citas no asistidas')} />
        <StatTile label="Pacientes totales" value={totalPacientes} icon={<Users size={17} />} accent="#64748b" spark={sparkTotal} sparkBaseline="min" onClick={() => { window.location.href = '/dashboard/patients' }} />
      </div>

      {/* Principal: "Consultas por médico" a lo ancho, justo bajo los KPIs. */}
      <ChartCard title="Consultas por médico" kicker={porMedico.length > 0 ? `${porMedico.length} ${porMedico.length === 1 ? 'médico' : 'médicos'}` : undefined}>
        {porMedico.length === 0 ? <Empty /> : <ColumnChart data={porMedico} color={C_TEAL} />}
      </ChartCard>

      {/* Analíticos secundarios: ranking por especialidad + tendencia horaria (2 columnas). */}
      <div className="rpt-grid">
        <ChartCard title="Pacientes atendidos por especialidad" kicker={porEspecialidad.length > 0 ? `${porEspecialidad.length} ${porEspecialidad.length === 1 ? 'especialidad' : 'especialidades'}` : undefined}>
          {porEspecialidad.length === 0 ? <Empty /> : <RankBars data={porEspecialidad} color={C_INDIGO} />}
        </ChartCard>

        {/* Horas pico (requiere RPC v2+) */}
        {horasData.length > 0 && (
          <ChartCard title="Citas por hora" kicker={horaPico}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={horasData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="hora" fontSize={11} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval="preserveStartEnd" minTickGap={10} />
                <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} width={28} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="Citas" stroke={C_INDIGO} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Desgloses de proporción (3 columnas, simétrico). */}
      <div className="rpt-grid-3">
        <ChartCard title="Citas por estado" kicker={kickerEstado}>
          {estadoSegs.length === 0 ? <Empty /> : <PropBar segments={estadoSegs} legend="rows" />}
        </ChartCard>

        <ChartCard title="Pacientes por género" kicker={kickerGenero}>
          <PropBar segments={generoSegs} legend="rows" />
        </ChartCard>

        <ChartCard title="Adultos vs. pediátricos" kicker={kickerEdad}>
          <PropBar segments={edadSegs} legend="rows" />
        </ChartCard>
      </div>

      {/* Modal de detalle del KPI */}
      {detail && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
             onClick={() => setDetail(null)}>
          <div className="card" style={{ maxWidth: 720, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '1.25rem', borderRadius: 'var(--radius-lg)' }} onClick={e => e.stopPropagation()}>
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
                    <tr style={{ textAlign: 'left', color: '#64748b' }}>
                      {cols.map(c => (
                        <th key={c.key} style={{ padding: '0.55rem 0.6rem', position: 'sticky', top: 0, background: '#f8fafc', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #e2e8f0' }}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        {cols.map(c => (
                          <td key={c.key} style={{ padding: '0.55rem 0.6rem' }}>
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
