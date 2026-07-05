import { describe, it, expect } from 'vitest'
import { sanitizeSearchTerm } from '../utils/validation'

/**
 * P0-3.1 — Los términos de búsqueda se interpolan dentro de filtros `.or()` de PostgREST,
 * donde `,` `(` `)` `"` son sintaxis del filtro y `%` `_` `*` son comodines de LIKE.
 * El sanitizador debe eliminarlos para que una búsqueda como "Pérez, Juan" no rompa
 * la consulta (400) ni permita manipular el filtro.
 */
describe('sanitizeSearchTerm', () => {
  it('deja pasar texto normal (letras, números, acentos, espacios)', () => {
    expect(sanitizeSearchTerm('Juan Pérez')).toBe('Juan Pérez')
    expect(sanitizeSearchTerm('0801-1990-12345')).toBe('0801-1990-12345')
    expect(sanitizeSearchTerm('María José Ñuñez')).toBe('María José Ñuñez')
  })

  it('elimina los separadores de sintaxis de PostgREST', () => {
    expect(sanitizeSearchTerm('Pérez, Juan')).toBe('Pérez Juan')
    expect(sanitizeSearchTerm('a(b)c')).toBe('abc')
    expect(sanitizeSearchTerm('nombre"raro"')).toBe('nombreraro')
    expect(sanitizeSearchTerm("O'Hara")).toBe('OHara')
    expect(sanitizeSearchTerm('a\\b')).toBe('ab')
  })

  it('elimina comodines de LIKE controlados por el usuario', () => {
    expect(sanitizeSearchTerm('%')).toBe('')
    expect(sanitizeSearchTerm('Ju_n')).toBe('Jun')
    expect(sanitizeSearchTerm('a*b')).toBe('ab')
  })

  it('impide inyectar condiciones adicionales en el filtro or()', () => {
    // Sin sanitizar, esto agregaría una condición extra al or(): `,clinic_id.neq.x`
    // (el `_` también se elimina por ser comodín de LIKE)
    expect(sanitizeSearchTerm('x%,clinic_id.neq.x')).toBe('xclinicid.neq.x')
    expect(sanitizeSearchTerm(',first_name.ilike.%')).toBe('firstname.ilike.')
  })

  it('colapsa espacios y recorta extremos', () => {
    expect(sanitizeSearchTerm('  Juan   Pérez  ')).toBe('Juan Pérez')
    expect(sanitizeSearchTerm(', , ,')).toBe('')
  })
})
