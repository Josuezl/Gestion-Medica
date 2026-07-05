'use client'

import React from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ResponsiveContainer } from 'recharts'
import { truncateLabel, type DiagnosisCount } from '@/utils/historySummary'

/**
 * Gráfico de barras horizontales con la frecuencia de diagnósticos del paciente.
 * Muestra los más frecuentes (tope 8). Las etiquetas se truncan a una línea para que no se
 * enciman; al pasar el mouse, el tooltip muestra el diagnóstico completo.
 */
export default function DiagnosesBarChart({ data }: { data: DiagnosisCount[] }) {
  if (!data || data.length === 0) return null
  const top = data.slice(0, 8).map((d) => ({ name: d.label, total: d.count }))
  const height = Math.max(160, top.length * 44 + 24)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={top} layout="vertical" margin={{ top: 8, right: 36, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
        <XAxis type="number" allowDecimals={false} fontSize={12} stroke="#94a3b8" />
        <YAxis
          type="category"
          dataKey="name"
          width={170}
          fontSize={12}
          stroke="#64748b"
          tickLine={false}
          interval={0}
          tickFormatter={(v: string) => truncateLabel(v)}
        />
        <Tooltip
          labelFormatter={(label: string) => label}
          formatter={(v: number) => [`${v} consulta${v === 1 ? '' : 's'}`, 'Frecuencia']}
        />
        <Bar dataKey="total" fill="#0d9488" radius={[0, 6, 6, 0]} maxBarSize={28}>
          <LabelList dataKey="total" position="right" fontSize={12} fill="#0f172a" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
