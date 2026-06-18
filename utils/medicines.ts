/**
 * Utilidades para los medicamentos de una receta.
 *
 * Las recetas nuevas se escriben como TEXTO LIBRE (un medicamento por línea); cada línea se
 * guarda como un ítem `{ name: <línea> }` con dose/frequency/duration vacíos. Las recetas
 * viejas tienen los 4 campos estructurados. Estos helpers permiten que ambos formatos se
 * rendericen y reconstruyan de forma uniforme.
 */
export interface Medicine {
  name?: string | null
  dose?: string | null
  frequency?: string | null
  duration?: string | null
}

const clean = (v?: string | null): string => {
  const t = (v ?? '').trim()
  return t && t.toUpperCase() !== 'N/A' ? t : ''
}

/** Detalle "dosis • frecuencia • duración" ignorando vacíos y 'N/A'. '' si no hay nada. */
export function medicineDetail(med: Medicine, sep = ' • '): string {
  return [clean(med.dose), clean(med.frequency), clean(med.duration)].filter(Boolean).join(sep)
}

/** "<nombre> <detalle>" o solo el nombre (para reconstruir el texto de "cargar última receta"). */
export function medicineToLine(med: Medicine): string {
  const name = clean(med.name)
  const detail = medicineDetail(med)
  return detail ? `${name} ${detail}`.trim() : name
}

/**
 * Convierte el textarea de medicamentos en el arreglo `medicines`: una línea = un ítem.
 * Quita la numeración inicial que el médico pudiera escribir ("1)", "2.", "3 -"), porque la
 * receta numera automáticamente.
 */
export function parseMedicinesText(text: string): Medicine[] {
  return (text || '')
    .split('\n')
    .map((line) => line.replace(/^\s*\d+\s*[.)\-]\s*/, '').trim())
    .filter(Boolean)
    .map((name) => ({ name, dose: '', frequency: '', duration: '' }))
}

/** Reconstruye el texto (una línea por medicamento) a partir del arreglo guardado. */
export function medicinesToText(medicines: Medicine[]): string {
  return (medicines || []).map(medicineToLine).filter(Boolean).join('\n')
}
