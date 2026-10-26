import React from 'react'
import { bpReadings, bpShortLabel } from '@/utils/bloodPressure'
import type { ConsultationRow } from '@/utils/clinicalTypes'

/**
 * Signos vitales de una consulta como etiquetas en una fila alineada a la izquierda, debajo de la
 * fecha y el médico (antes se amontonaban a la derecha en columnas desparejas). La presión se
 * distingue del resto por color; cada etiqueta separa el nombre del valor.
 */
export default function ConsultVitalsChips({ consult }: { consult: ConsultationRow }) {
  const chips: { key: string; label: string; value: string; pa?: boolean }[] = [
    ...bpReadings(consult).map((r) => ({ key: `pa-${r.arm ?? 'x'}`, label: bpShortLabel(r.arm), value: r.value, pa: true })),
  ]
  if (consult.temperature) chips.push({ key: 't', label: 'T°', value: `${consult.temperature} °C` })
  if (consult.weight) chips.push({ key: 'w', label: 'Peso', value: `${consult.weight} kg` })
  if (consult.heart_rate) chips.push({ key: 'fc', label: 'FC', value: `${consult.heart_rate} bpm` })
  if (consult.respiratory_rate) chips.push({ key: 'fr', label: 'FR', value: `${consult.respiratory_rate} rpm` })
  if (consult.oxygen_saturation) chips.push({ key: 'spo2', label: 'SpO2', value: `${consult.oxygen_saturation} %` })
  if (chips.length === 0) return null

  return (
    <div className="vital-chips">
      {chips.map((c) => (
        <span key={c.key} className={c.pa ? 'vital-chip vital-chip--pa' : 'vital-chip'}>
          <span className="vital-chip-label">{c.label}</span>
          <strong>{c.value}</strong>
        </span>
      ))}
    </div>
  )
}
