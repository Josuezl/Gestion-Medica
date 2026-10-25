'use client'

import React from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { WHO_GROWTH, PERCENTILE_Z, lmsValue, WhoMeasure } from './who-growth-data'
import type { ConsultationRow, PatientRow } from '@/utils/clinicalTypes'

interface PediatricGrowthChartProps {
  consultations: ConsultationRow[]
  patient: PatientRow
}

/** Punto de la gráfica: mes + percentiles OMS (P3..P97) + medida del paciente si existe. */
type GrowthPoint = Record<string, number | undefined> & { month: number }

// Edad en meses entre nacimiento y la fecha de la consulta
function getAgeInMonths(birthDate: string, consultDate: string) {
  const bd = new Date(birthDate)
  const cd = new Date(consultDate)
  let months = (cd.getFullYear() - bd.getFullYear()) * 12
  months -= bd.getMonth()
  months += cd.getMonth()
  return months <= 0 ? 0 : months
}

const round1 = (x: number) => Math.round(x * 10) / 10

// Construye la data de una gráfica: percentiles OMS por mes + puntos del paciente
function buildData(
  measure: WhoMeasure | null,
  sex: 'boys' | 'girls' | null,
  maxMonth: number,
  patientPoints: Map<number, number>
) {
  const data: GrowthPoint[] = []
  for (let m = 0; m <= maxMonth; m++) {
    const point: GrowthPoint = { month: m }
    if (measure && sex) {
      const lms = measure[sex][m]
      if (lms) {
        for (const { label, z } of PERCENTILE_Z) {
          point[label] = round1(lmsValue(lms[0], lms[1], lms[2], z))
        }
      }
    }
    if (patientPoints.has(m)) point.patient = patientPoints.get(m)
    data.push(point)
  }
  return data
}

// Convención de las tablas impresas de la OMS: mediana verde, P15/P85 naranja, P3/P97 rojo. Tonos
// ajustados y validados para daltonismo; como ámbar y verde quedan al límite, cada par lleva además
// su propio trazo y una etiqueta al final de la línea (el color nunca es la única señal).
const PERC_STYLE: Record<string, { color: string; text: string; width: number; dash?: string }> = {
  P3: { color: '#b91c1c', text: '#b91c1c', width: 1.5, dash: '5 4' },
  P15: { color: '#d97706', text: '#b45309', width: 1.5, dash: '2 3' },
  P50: { color: '#15803d', text: '#15803d', width: 2 },
  P85: { color: '#d97706', text: '#b45309', width: 1.5, dash: '2 3' },
  P97: { color: '#b91c1c', text: '#b91c1c', width: 1.5, dash: '5 4' },
}
// El paciente va en índigo en las tres gráficas: no se confunde con ningún percentil.
const PATIENT_COLOR = '#4338ca'

/** Etiqueta «P50», «P97»… solo en el último punto con dato de esa curva. */
function endLabel(label: string, lastIndex: number) {
  function EndLabel({ x, y, index }: { x?: number | string; y?: number | string; index?: number }) {
    // Recharts exige un elemento: un <g> vacío en los demás puntos.
    if (index !== lastIndex || x == null || y == null) return <g />
    return (
      <text x={Number(x) + 6} y={Number(y) + 4} fontSize={11} fontWeight={700} fill={PERC_STYLE[label].text}>
        {label}
      </text>
    )
  }
  return EndLabel
}

function GrowthChart({
  title, unit, data, maxMonth, hasReference, note,
}: {
  title: string; unit: string; data: GrowthPoint[]; maxMonth: number
  hasReference: boolean; note?: string
}) {
  const tickStep = maxMonth <= 60 ? 12 : 24
  const ticks: number[] = []
  for (let m = 0; m <= maxMonth; m += tickStep) ticks.push(m)

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-main)' }}>{title}</h4>
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 40, left: 8, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" />
            <XAxis
              dataKey="month" type="number" domain={[0, maxMonth]} ticks={ticks}
              tickFormatter={(m) => `${Math.round(m / 12)}a`} stroke="#9ca3af" fontSize={12}
              label={{ value: 'Edad (años)', position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 12 }}
            />
            <YAxis stroke="#9ca3af" fontSize={12} width={48}
              label={{ value: unit, angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 12 }} />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}
              labelFormatter={(m: number) => `Edad: ${m} meses (${Math.floor(m / 12)}a ${m % 12}m)`}
            />
            {/* Texto de la leyenda en tinta neutra: el color lo lleva la marca, no la letra. */}
            <Legend verticalAlign="top" height={32} wrapperStyle={{ fontSize: '0.75rem' }}
              formatter={(value: string) => <span style={{ color: '#334155' }}>{value}</span>} />

            {hasReference && PERCENTILE_Z.map(({ label }) => {
              const style = PERC_STYLE[label]
              const lastIndex = data.findLastIndex((p) => p[label] != null)
              return (
                <Line
                  key={label} dataKey={label} name={`OMS ${label}`}
                  stroke={style.color} strokeWidth={style.width} strokeDasharray={style.dash}
                  dot={false} activeDot={false} connectNulls isAnimationActive={false}
                  label={endLabel(label, lastIndex)}
                />
              )
            })}

            <Line
              dataKey="patient" name="Paciente" stroke={PATIENT_COLOR} strokeWidth={2}
              dot={{ r: 5, strokeWidth: 2.5, fill: '#ffffff' }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {note && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.25rem' }}>{note}</p>}
    </div>
  )
}

export default function PediatricGrowthChart({ consultations, patient }: PediatricGrowthChartProps) {
  const sex: 'boys' | 'girls' | null =
    patient.gender === 'M' ? 'boys' : patient.gender === 'F' ? 'girls' : null

  // Puntos del paciente por medida (mapa mes -> valor)
  const weightPts = new Map<number, number>()
  const heightPts = new Map<number, number>()
  const hcPts = new Map<number, number>()
  let maxPatientMonth = 0

  for (const c of consultations) {
    const m = getAgeInMonths(patient.birth_date || '', c.created_at)
    maxPatientMonth = Math.max(maxPatientMonth, m)
    // Los vitales pueden venir como texto en datos migrados; se normalizan con Number().
    const w = c.weight as number | string | null
    const h = c.height as number | string | null
    const hc = c.head_circumference as number | string | null
    if (w != null && w !== '') weightPts.set(m, Number(w))
    if (h != null && h !== '') heightPts.set(m, Number(h))
    if (hc != null && hc !== '') hcPts.set(m, Number(hc))
  }

  // Rango por gráfica: cubre la referencia OMS y, si el paciente la excede, sus puntos
  const wfaMax = Math.min(228, Math.max(120, maxPatientMonth))
  const hfaMax = Math.min(240, Math.max(228, maxPatientMonth))
  const hcMax = Math.max(60, maxPatientMonth)

  const weightData = buildData(WHO_GROWTH.wfa, sex, wfaMax, weightPts)
  const heightData = buildData(WHO_GROWTH.hfa, sex, hfaMax, heightPts)
  const hcData = buildData(WHO_GROWTH.hcfa, sex, hcMax, hcPts)

  const styles = {
    container: {
      backgroundColor: 'var(--bg-card)',
      padding: '1.5rem',
      borderRadius: '8px',
      border: '1px solid var(--border-color)',
      marginBottom: '1.5rem',
    } as React.CSSProperties,
  }

  const sexNote = !sex ? 'Sin curvas de referencia OMS: el género del paciente es "Otro" o no está especificado. La OMS solo provee tablas para masculino y femenino.' : undefined

  return (
    <div style={styles.container}>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
        Curvas de Crecimiento (OMS)
      </h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Percentiles de referencia de la OMS según edad y sexo: <strong style={{ color: '#15803d' }}>P50</strong> la
        mediana, <strong style={{ color: '#b45309' }}>P15 y P85</strong>, y <strong style={{ color: '#b91c1c' }}>P3 y P97</strong> los
        límites. Los puntos índigo son las mediciones del paciente en cada consulta.
      </p>

      <GrowthChart
        title="Peso para la edad" unit="Peso (kg)"
        data={weightData} maxMonth={wfaMax} hasReference={!!sex}
        note={sexNote || (maxPatientMonth > 120 ? 'La OMS no define peso-para-edad después de los 10 años; arriba de esa edad solo se muestran los puntos del paciente.' : undefined)}
      />

      <GrowthChart
        title="Talla para la edad" unit="Talla (cm)"
        data={heightData} maxMonth={hfaMax} hasReference={!!sex}
        note={sexNote}
      />

      <GrowthChart
        title="Perímetro cefálico para la edad" unit="P. cefálico (cm)"
        data={hcData} maxMonth={hcMax} hasReference={!!sex}
        note={sexNote || (maxPatientMonth > 60 ? 'La referencia OMS de perímetro cefálico solo existe hasta los 5 años; arriba de esa edad solo se muestran los puntos del paciente.' : undefined)}
      />
    </div>
  )
}
