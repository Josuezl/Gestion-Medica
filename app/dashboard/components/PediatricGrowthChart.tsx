'use client'

import React from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { WHO_GROWTH, PERCENTILE_Z, lmsValue, WhoMeasure } from './who-growth-data'

interface PediatricGrowthChartProps {
  consultations: any[]
  patient: any
}

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
  const data: any[] = []
  for (let m = 0; m <= maxMonth; m++) {
    const point: any = { month: m }
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

const PERC_COLOR: Record<string, string> = {
  P3: '#cbd5e1', P15: '#cbd5e1', P50: '#94a3b8', P85: '#cbd5e1', P97: '#cbd5e1',
}
// Solo estos percentiles se muestran en la leyenda (para no saturar)
const PERC_IN_LEGEND = new Set(['P3', 'P50', 'P97'])

function GrowthChart({
  title, unit, color, data, maxMonth, hasReference, note,
}: {
  title: string; unit: string; color: string; data: any[]; maxMonth: number
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
          <LineChart data={data} margin={{ top: 5, right: 24, left: 8, bottom: 20 }}>
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
            <Legend verticalAlign="top" height={32} wrapperStyle={{ fontSize: '0.75rem' }} />

            {hasReference && PERCENTILE_Z.map(({ label }) => (
              <Line
                key={label} dataKey={label} name={`OMS ${label}`}
                stroke={PERC_COLOR[label]} strokeWidth={label === 'P50' ? 1.5 : 1}
                strokeDasharray={label === 'P3' || label === 'P97' ? '4 4' : undefined}
                dot={false} activeDot={false} connectNulls isAnimationActive={false}
                legendType={PERC_IN_LEGEND.has(label) ? 'line' : 'none'}
              />
            ))}

            <Line
              dataKey="patient" name="Paciente" stroke={color} strokeWidth={3}
              dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false}
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
    const m = getAgeInMonths(patient.birth_date, c.created_at)
    maxPatientMonth = Math.max(maxPatientMonth, m)
    if (c.weight != null && c.weight !== '') weightPts.set(m, Number(c.weight))
    if (c.height != null && c.height !== '') heightPts.set(m, Number(c.height))
    if (c.head_circumference != null && c.head_circumference !== '') hcPts.set(m, Number(c.head_circumference))
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
        Las líneas grises son los percentiles de referencia de la OMS (P3 a P97) según edad y sexo.
        Los puntos de color son las mediciones del paciente en cada consulta.
      </p>

      <GrowthChart
        title="Peso para la edad" unit="Peso (kg)" color="#8b5cf6"
        data={weightData} maxMonth={wfaMax} hasReference={!!sex}
        note={sexNote || (maxPatientMonth > 120 ? 'La OMS no define peso-para-edad después de los 10 años; arriba de esa edad solo se muestran los puntos del paciente.' : undefined)}
      />

      <GrowthChart
        title="Talla para la edad" unit="Talla (cm)" color="#10b981"
        data={heightData} maxMonth={hfaMax} hasReference={!!sex}
        note={sexNote}
      />

      <GrowthChart
        title="Perímetro cefálico para la edad" unit="P. cefálico (cm)" color="#f59e0b"
        data={hcData} maxMonth={hcMax} hasReference={!!sex}
        note={sexNote || (maxPatientMonth > 60 ? 'La referencia OMS de perímetro cefálico solo existe hasta los 5 años; arriba de esa edad solo se muestran los puntos del paciente.' : undefined)}
      />
    </div>
  )
}
