import { test, expect } from 'vitest'
import { validarEntornoE2e } from '@/e2e/guardia-entorno'

test('acepta Supabase local', () =>
  expect(() => validarEntornoE2e({ url: 'http://127.0.0.1:54321', serviceKey: 'x' })).not.toThrow())
test('rechaza cualquier proyecto en la nube', () =>
  expect(() => validarEntornoE2e({ url: 'https://zkpwabcd.supabase.co', serviceKey: 'x' })).toThrow('no es local'))
test('rechaza URL vacía', () => expect(() => validarEntornoE2e({ serviceKey: 'x' })).toThrow('no es local'))
test('rechaza sin clave', () => expect(() => validarEntornoE2e({ url: 'http://localhost:54321' })).toThrow('falta SUPABASE_SERVICE_ROLE_KEY'))
