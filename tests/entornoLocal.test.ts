import { test, expect } from 'vitest'
import { esUrlLocal, variablesDevLocal } from '@/utils/entornoLocal'

test('reconoce Supabase local', () => {
  expect(esUrlLocal('http://127.0.0.1:54321')).toBe(true)
  expect(esUrlLocal('http://localhost:54321/')).toBe(true)
})
test('rechaza la nube y lo vacío', () => {
  expect(esUrlLocal('https://zkpwabcd.supabase.co')).toBe(false)
  expect(esUrlLocal('')).toBe(false)
  expect(esUrlLocal(undefined)).toBe(false)
})
const status = { API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'anon-local', SERVICE_ROLE_KEY: 'service-local' }
test('arma las variables locales y apaga los envíos reales', () => {
  const v = variablesDevLocal(status)
  expect(v.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321')
  expect(v.SUPABASE_SERVICE_ROLE_KEY).toBe('service-local')
  expect(v.RESEND_API_KEY).toBe('')
  expect(v.WHATSAPP_ACCESS_TOKEN).toBe('')
})
test('sin Supabase local corriendo, falla con instrucción clara', () =>
  expect(() => variablesDevLocal({})).toThrow('npm run db:local'))
test('el sitio local usa el puerto 2000 (el 3000 es de Control)', () =>
  expect(variablesDevLocal(status).NEXT_PUBLIC_SITE_URL).toBe('http://localhost:2000'))
