import { describe, it, expect } from 'vitest'
import { medicineDetail, medicineToLine, parseMedicinesText, medicinesToText } from '@/utils/medicines'

describe('medicineDetail', () => {
  it('une dosis • frecuencia • duración', () => {
    expect(medicineDetail({ dose: '500mg', frequency: 'c/8h', duration: '7 días' })).toBe('500mg • c/8h • 7 días')
  })

  it("ignora vacíos y 'N/A'", () => {
    expect(medicineDetail({ dose: 'N/A', frequency: '', duration: '7 días' })).toBe('7 días')
  })

  it('devuelve "" cuando no hay detalle (receta de texto libre)', () => {
    expect(medicineDetail({ name: 'Paracetamol' })).toBe('')
  })
})

describe('parseMedicinesText', () => {
  it('una línea = un medicamento, quitando numeración inicial y líneas vacías', () => {
    const out = parseMedicinesText('1) Paracetamol\n2. Ibuprofeno\n3 - Naproxeno\n\n   ')
    expect(out.map((m) => m.name)).toEqual(['Paracetamol', 'Ibuprofeno', 'Naproxeno'])
  })

  it('NO recorta dosis que empiezan con número (solo numeración tipo 1./1)/1-)', () => {
    const out = parseMedicinesText('1000 mg de Metformina')
    expect(out[0].name).toBe('1000 mg de Metformina')
  })
})

describe('medicineToLine / medicinesToText', () => {
  it('reconstruye nombre + detalle', () => {
    expect(medicineToLine({ name: 'X', dose: '1', frequency: '2', duration: '3' })).toBe('X 1 • 2 • 3')
    expect(medicineToLine({ name: 'X' })).toBe('X')
  })

  it('reconstruye el textarea (una línea por medicamento)', () => {
    expect(medicinesToText([{ name: 'A' }, { name: 'B' }])).toBe('A\nB')
  })
})
