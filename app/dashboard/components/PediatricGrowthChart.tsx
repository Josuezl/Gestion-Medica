'use client'

import React from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

interface PediatricGrowthChartProps {
  consultations: any[]
  patient: any
}

// Para calcular meses de edad desde nacimiento
function getAgeInMonths(birthDate: string, consultDate: string) {
  const bd = new Date(birthDate)
  const cd = new Date(consultDate)
  let months = (cd.getFullYear() - bd.getFullYear()) * 12
  months -= bd.getMonth()
  months += cd.getMonth()
  return months <= 0 ? 0 : months
}

export default function PediatricGrowthChart({ consultations, patient }: PediatricGrowthChartProps) {
  // Ordenar consultas por fecha ascendente
  const sortedConsultations = [...consultations]
    .filter(c => c.weight || c.height)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  // Preparar datos para la gráfica
  const chartData = sortedConsultations.map(c => {
    const ageMonths = getAgeInMonths(patient.birth_date, c.created_at)
    return {
      name: `${ageMonths}m`,
      ageMonths,
      peso: c.weight || null,
      talla: c.height || null,
      fecha: new Date(c.created_at).toLocaleDateString('es-HN')
    }
  })

  // Estilos rápidos
  const styles = {
    container: {
      backgroundColor: 'var(--bg-card)',
      padding: '1.5rem',
      borderRadius: '8px',
      border: '1px solid var(--border-color)',
      marginBottom: '1.5rem',
    },
    title: {
      fontSize: '1.1rem',
      fontWeight: '700',
      marginBottom: '1rem',
      color: 'var(--text-main)'
    },
    chartWrapper: {
      width: '100%',
      height: 350,
      marginTop: '1rem'
    }
  }

  if (chartData.length === 0) {
    return (
      <div style={styles.container}>
        <h4 style={styles.title}>Curvas de Crecimiento (Peso / Talla)</h4>
        <p style={{ color: 'var(--text-muted)' }}>No hay suficientes datos de peso y talla registrados en consultas para graficar.</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <h4 style={styles.title}>Curvas de Crecimiento</h4>
      
      <div style={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} />
            <YAxis yAxisId="left" stroke="#8b5cf6" fontSize={12} label={{ value: 'Peso (kg)', angle: -90, position: 'insideLeft', fill: '#8b5cf6' }} />
            <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={12} label={{ value: 'Talla (cm)', angle: 90, position: 'insideRight', fill: '#10b981' }} />
            <Tooltip 
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
              labelStyle={{ fontWeight: 'bold', color: '#374151' }}
            />
            <Legend verticalAlign="top" height={36} />
            
            <Line yAxisId="left" type="monotone" dataKey="peso" name="Peso del Paciente (kg)" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
            <Line yAxisId="right" type="monotone" dataKey="talla" name="Talla del Paciente (cm)" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem', textAlign: 'center' }}>
        * Los puntos muestran el peso y talla registrados en cada consulta clínica.
      </p>
    </div>
  )
}
