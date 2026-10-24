import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { versionFileContent } from '@/utils/appVersion'

test('usa el commit de Vercel', () => expect(versionFileContent('abc123')).toBe('{"version":"abc123"}'))
test('sin commit queda sin-version', () => {
  expect(versionFileContent(undefined)).toBe('{"version":"sin-version"}')
  expect(versionFileContent('')).toBe('{"version":"sin-version"}')
})
test('version.json no pasa por el middleware (gastaría getUser de Supabase)', () => {
  expect(readFileSync('middleware.ts', 'utf8')).toContain('version\\\\.json')
})
