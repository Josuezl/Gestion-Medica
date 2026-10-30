import { describe, it, expect } from 'vitest'
import {
  inferirEstado,
  estadoEfectivo,
  textoInicial,
  antecedenteParaMostrar,
  antecedentesDesdeFormulario,
} from '@/utils/antecedentes'

describe('inferirEstado (registros sin estado guardado)', () => {
  it('vacío, «Ninguna conocida» y «desconoce» → Sin registrar', () => {
    expect(inferirEstado(null)).toBe('sin_registrar')
    expect(inferirEstado('  ')).toBe('sin_registrar')
    expect(inferirEstado('Ninguna conocida')).toBe('sin_registrar')
    expect(inferirEstado('DESCONOCE.')).toBe('sin_registrar')
  })

  it('negaciones → Niega', () => {
    for (const t of ['Niega', 'NIEGA', 'n iega', 'Ninguno', 'Negativos', 'no']) expect(inferirEstado(t)).toBe('niega')
  })

  it('cualquier otro texto → Refiere', () => {
    expect(inferirEstado('HTA')).toBe('refiere')
    expect(inferirEstado('Estado civil: C')).toBe('refiere')
  })
})

describe('estadoEfectivo', () => {
  it('el estado guardado manda sobre el texto', () => {
    expect(estadoEfectivo('niega', 'HTA')).toBe('niega')
    expect(estadoEfectivo(null, 'HTA')).toBe('refiere')
    expect(estadoEfectivo('otro', 'niega')).toBe('niega')
  })
})

describe('textoInicial', () => {
  it('Refiere muestra el detalle; Niega solo una observación real', () => {
    expect(textoInicial('refiere', 'HTA')).toBe('HTA')
    expect(textoInicial('niega', 'Niega')).toBe('')
    expect(textoInicial('niega', 'Solo de niño')).toBe('Solo de niño')
    expect(textoInicial('sin_registrar', 'Ninguna conocida')).toBe('')
  })
})

describe('antecedenteParaMostrar', () => {
  it('textos para las vistas', () => {
    expect(antecedenteParaMostrar(null, 'Ninguna conocida')).toBe('Sin registrar')
    expect(antecedenteParaMostrar(null, 'Niega')).toBe('Niega')
    expect(antecedenteParaMostrar('niega', 'Solo de niño')).toBe('Niega · Solo de niño')
    expect(antecedenteParaMostrar('refiere', 'Penicilina')).toBe('Penicilina')
  })
})

describe('antecedentesDesdeFormulario', () => {
  const fd = (campos: Record<string, string>) => {
    const f = new FormData()
    for (const [k, v] of Object.entries(campos)) f.set(k, v)
    return f
  }

  it('Sin registrar no toca el texto', () => {
    const { cambios, error } = antecedentesDesdeFormulario(fd({ allergies_status: 'sin_registrar', allergies: 'x' }))
    expect(error).toBeNull()
    expect(cambios).toEqual({ allergies_status: 'sin_registrar' })
  })

  it('Niega guarda la observación o nada', () => {
    expect(antecedentesDesdeFormulario(fd({ family_history_status: 'niega', family_history: '' })).cambios)
      .toEqual({ family_history_status: 'niega', family_history: null })
    expect(antecedentesDesdeFormulario(fd({ family_history_status: 'niega', family_history: ' Padre sano ' })).cambios)
      .toEqual({ family_history_status: 'niega', family_history: 'Padre sano' })
  })

  it('Refiere exige el detalle', () => {
    const r = antecedentesDesdeFormulario(fd({ allergies_status: 'refiere', allergies: ' ' }))
    expect(r.error).toMatch(/Alergias/)
    expect(antecedentesDesdeFormulario(fd({ allergies_status: 'refiere', allergies: 'Penicilina' })).cambios)
      .toEqual({ allergies_status: 'refiere', allergies: 'Penicilina' })
  })

  it('formulario viejo (sin estado): guarda el texto y deja el estado para deducir', () => {
    expect(antecedentesDesdeFormulario(fd({ pathological_history: 'HTA' })).cambios)
      .toEqual({ pathological_history: 'HTA', pathological_history_status: null })
  })

  it('campos que no vienen no se tocan', () => {
    expect(antecedentesDesdeFormulario(new FormData()).cambios).toEqual({})
  })
})
