import { describe, expect, it } from 'vitest'
import { etiquetaTipoConsulta } from '@/utils/tipoConsulta'

describe('etiquetaTipoConsulta', () => {
  it('identifica las consultas dentales', () => {
    expect(etiquetaTipoConsulta('DENTAL')).toBe('Odontología')
  })

  it.each(['MEDICA', 'OTRA', '', null, undefined])('no etiqueta el tipo %s', (tipo) => {
    expect(etiquetaTipoConsulta(tipo)).toBeNull()
  })
})
