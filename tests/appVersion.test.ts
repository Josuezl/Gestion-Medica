import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  versionFileContent, decidirAccionVersion, recargaReciente, marcarRecarga, empaquetarRespaldo, leerRespaldo,
} from '@/utils/appVersion'

test('usa el commit de Vercel', () => expect(versionFileContent('abc123')).toBe('{"version":"abc123"}'))
test('sin commit queda sin-version', () => {
  expect(versionFileContent(undefined)).toBe('{"version":"sin-version"}')
  expect(versionFileContent('')).toBe('{"version":"sin-version"}')
})
test('version.json no pasa por el middleware (gastaría getUser de Supabase)', () => {
  expect(readFileSync('middleware.ts', 'utf8')).toContain('version\\\\.json')
})

const base = { local: 'aaa', servidor: 'bbb', motivo: 'navegacion' as const, recargaReciente: false }
test('al navegar con versión nueva recarga', () => expect(decidirAccionVersion(base)).toBe('recargar'))
test('por intervalo, foco o fallo de guardado solo avisa', () => {
  for (const motivo of ['intervalo', 'foco', 'fallo_guardado'] as const)
    expect(decidirAccionVersion({ ...base, motivo })).toBe('avisar')
})
test('iguales: nada', () => expect(decidirAccionVersion({ ...base, servidor: 'aaa' })).toBe('nada'))
test('sin respuesta del servidor: nada', () => expect(decidirAccionVersion({ ...base, servidor: null })).toBe('nada'))
test('local sin versión: nada', () => expect(decidirAccionVersion({ ...base, local: undefined })).toBe('nada'))
test('en local sin-version contra sin-version: nada', () =>
  expect(decidirAccionVersion({ ...base, local: 'sin-version', servidor: 'sin-version' })).toBe('nada'))
test('un rollback a un commit anterior también cuenta', () =>
  expect(decidirAccionVersion({ ...base, local: 'nuevo', servidor: 'viejo' })).toBe('recargar'))
test('si recargó hace < 60 s, avisa en vez de recargar', () =>
  expect(decidirAccionVersion({ ...base, recargaReciente: true })).toBe('avisar'))
test('recargaReciente: ventana de 60 s, por versión, tolera storage bloqueado', () => {
  const m = new Map<string, string>()
  const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
  marcarRecarga('bbb', 1_000, s)
  expect(recargaReciente('bbb', 30_000, s)).toBe(true)
  expect(recargaReciente('bbb', 61_001, s)).toBe(false)
  expect(recargaReciente('ccc', 30_000, s)).toBe(false)
  expect(recargaReciente('bbb', 30_000, { getItem: () => { throw new Error('bloqueado') } })).toBe(false)
})
test('respaldo de formularios: misma ruta y menos de 10 min', () => {
  const raw = empaquetarRespaldo('/dashboard/patients/new', { '0': { nombre: 'Ana' } }, 1_000)
  expect(leerRespaldo(raw, '/dashboard/patients/new', 60_000)).toEqual({ '0': { nombre: 'Ana' } })
  expect(leerRespaldo(raw, '/dashboard', 60_000)).toBeNull()
  expect(leerRespaldo(raw, '/dashboard/patients/new', 1_000 + 10 * 60 * 1000 + 1)).toBeNull()
  expect(leerRespaldo('{roto', '/dashboard/patients/new', 2_000)).toBeNull()
  expect(leerRespaldo(null, '/dashboard/patients/new', 2_000)).toBeNull()
})
