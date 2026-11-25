import { describe, expect, it } from 'vitest'
import { denticionPorEdad, estadoVacio, piezasDe, validarEstado } from '@/utils/odontograma'

describe('denticionPorEdad', () => {
  it.each([
    ['2022-01-01', 'TEMPORAL'],
    ['2020-11-26', 'TEMPORAL'],
    ['2020-11-25', 'MIXTA'],
    ['2017-06-01', 'MIXTA'],
    ['2013-11-26', 'MIXTA'],
    ['2013-11-25', 'PERMANENTE'],
    ['2010-01-01', 'PERMANENTE'],
    [null, 'PERMANENTE'],
  ])('para fecha de nacimiento %s devuelve %s', (fecha, denticion) => {
    expect(denticionPorEdad(fecha, new Date('2026-11-25'))).toBe(denticion)
  })
})

describe('piezasDe', () => {
  it('devuelve las 32 piezas permanentes en orden de dibujo', () => {
    expect(piezasDe('PERMANENTE')).toEqual([
      18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
      48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
    ])
  })

  it('devuelve las 20 piezas temporales en orden de dibujo', () => {
    expect(piezasDe('TEMPORAL')).toEqual([
      55, 54, 53, 52, 51, 61, 62, 63, 64, 65,
      85, 84, 83, 82, 81, 71, 72, 73, 74, 75,
    ])
  })

  it('incluye las 52 piezas en la dentición mixta', () => {
    expect(piezasDe('MIXTA')).toEqual([...piezasDe('PERMANENTE'), ...piezasDe('TEMPORAL')])
  })
})

describe('validarEstado', () => {
  const caries = { hallazgo: 'CARIES', estado: 'PENDIENTE' }
  const puente = { hallazgo: 'PUENTE', estado: 'REALIZADO' }
  const protesis = { hallazgo: 'PROTESIS_REMOVIBLE', estado: 'PENDIENTE' }
  const vacio = { version: 1, piezas: {}, regiones: {} }

  it('acepta el estado vacío', () => {
    expect(estadoVacio()).toEqual(vacio)
    expect(validarEstado(estadoVacio())).toEqual({ ok: true, estado: vacio })
  })

  it('devuelve un estado nuevo con solo las claves conocidas y piezas con contenido', () => {
    const corona = { hallazgo: 'CORONA', estado: 'REALIZADO' }
    const entrada = {
      ...vacio,
      x: 1,
      piezas: {
        '36': { x: 1, caras: { O: { ...caries, x: 1 } }, pieza: { ...corona, x: 1 }, nota: 'Control' },
        '37': { x: 1, caras: {}, nota: '' },
      },
      regiones: { S1: { ...puente, nota: 'Revisar', x: 1 } },
    }

    const resultado = validarEstado(entrada)

    expect(resultado).toEqual({
      ok: true,
      estado: {
        version: 1,
        piezas: { '36': { caras: { O: caries }, pieza: corona, nota: 'Control' } },
        regiones: { S1: { ...puente, nota: 'Revisar' } },
      },
    })
    if (resultado.ok) expect(resultado.estado).not.toBe(entrada)
  })

  it.each([
    ['pieza 99', { ...vacio, piezas: { '99': {} } }],
    ['cara X', { ...vacio, piezas: { '36': { caras: { X: caries } } } }],
    ['hallazgo inventado', { ...vacio, piezas: { '36': { caras: { O: { ...caries, hallazgo: 'INVENTADO' } } } } }],
    ['estado desconocido', { ...vacio, regiones: { S1: { ...puente, estado: 'HECHO' } } }],
    ['caries en una región', { ...vacio, regiones: { S1: caries } }],
    ['caries en una pieza entera', { ...vacio, piezas: { '36': { pieza: caries } } }],
    ['puente en una cara', { ...vacio, piezas: { '36': { caras: { O: puente } } } }],
    ['versión desconocida', { ...vacio, version: 2 }],
    ['región S7', { ...vacio, regiones: { S7: puente } }],
    ['nota de pieza de 501 caracteres', { ...vacio, piezas: { '36': { nota: 'a'.repeat(501) } } }],
    ['nota de región de 501 caracteres', { ...vacio, regiones: { S1: { ...puente, nota: 'a'.repeat(501) } } }],
    ['nota de tipo incorrecto', { ...vacio, piezas: { '36': { nota: 123 } } }],
    ['pieza nula', { ...vacio, piezas: { '36': null } }],
    ['mapa de caras como arreglo', { ...vacio, piezas: { '36': { caras: [] } } }],
    ['marca de pieza incompleta', { ...vacio, piezas: { '36': { pieza: { hallazgo: 'CORONA' } } } }],
    ['mapa de regiones ausente', { version: 1, piezas: {} }],
    ['valor nulo', null],
    ['cadena', 'odontograma'],
    ['arreglo', []],
  ])('rechaza %s con un error', (_caso, estado) => {
    expect(validarEstado(estado)).toEqual({ ok: false, error: expect.stringMatching(/\S/) })
  })

  it.each([['puente', puente], ['prótesis removible', protesis]])('acepta %s en pieza y región', (_caso, marca) => {
    const estado = { ...vacio, piezas: { '36': { pieza: marca } }, regiones: { AI: marca } }
    expect(validarEstado(estado)).toEqual({ ok: true, estado })
  })

  it('conserva las marcas temporales al ocultar la pieza en dentición permanente', () => {
    const estado = {
      ...vacio,
      piezas: {
        '55': { caras: { O: caries }, nota: 'a'.repeat(500) },
        '36': { pieza: { hallazgo: 'CORONA', estado: 'REALIZADO' } },
      },
      regiones: { S1: { ...puente, nota: 'Revisar en la próxima consulta' } },
    }

    expect(piezasDe('MIXTA')).toContain(55)
    expect(piezasDe('PERMANENTE')).not.toContain(55)
    expect(validarEstado(estado)).toEqual({ ok: true, estado })
  })
})
