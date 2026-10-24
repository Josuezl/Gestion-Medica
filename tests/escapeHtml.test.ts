import { describe, it, expect } from 'vitest'
import { escapeHtml } from '@/utils/escapeHtml'

describe('escapeHtml', () => {
  it('neutraliza etiquetas y atributos', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
  })

  it('escapa & primero (sin doble escape) y comillas simples', () => {
    expect(escapeHtml(`Tom & Jerry's`)).toBe('Tom &amp; Jerry&#39;s')
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })

  it('null/undefined → vacío; números a texto; acentos intactos', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(36.8)).toBe('36.8')
    expect(escapeHtml('Zúñiga — 120/80')).toBe('Zúñiga — 120/80')
  })
})
