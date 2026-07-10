import { describe, it, expect } from 'vitest'
import {
  DRAFT_TTL_MS,
  draftKey,
  formDataToFields,
  saveDraft,
  loadDraft,
  clearDraft,
  purgeExpiredDrafts,
} from '@/utils/formDraft'

// Storage falso en memoria con la misma interfaz que localStorage.
function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => { map.clear() },
  }
}

// Storage que revienta al escribir (cuota llena / modo privado de Safari).
function throwingStorage(): Storage {
  const base = fakeStorage()
  return { ...base, setItem: () => { throw new Error('QuotaExceededError') } }
}

describe('draftKey', () => {
  it('incluye versión, usuario y paciente', () => {
    expect(draftKey('user-1', 'pat-2')).toBe('consultation-draft:v1:user-1:pat-2')
  })
})

describe('saveDraft / loadDraft', () => {
  it('roundtrip: guarda y recupera campos con timestamp', () => {
    const s = fakeStorage()
    const key = draftKey('u', 'p')
    saveDraft(s, key, { diagnosis: 'Gripe', symptoms: 'Tos' }, 1000)
    const draft = loadDraft(s, key, 2000)
    expect(draft).not.toBeNull()
    expect(draft!.savedAt).toBe(1000)
    expect(draft!.fields).toEqual({ diagnosis: 'Gripe', symptoms: 'Tos' })
  })

  it('devuelve null si no hay borrador', () => {
    expect(loadDraft(fakeStorage(), draftKey('u', 'p'))).toBeNull()
  })

  it('borrador expirado (>24h): devuelve null y lo elimina', () => {
    const s = fakeStorage()
    const key = draftKey('u', 'p')
    saveDraft(s, key, { diagnosis: 'X' }, 0)
    expect(loadDraft(s, key, DRAFT_TTL_MS + 1)).toBeNull()
    expect(s.getItem(key)).toBeNull()
  })

  it('borrador justo dentro del TTL sigue vivo', () => {
    const s = fakeStorage()
    const key = draftKey('u', 'p')
    saveDraft(s, key, { diagnosis: 'X' }, 0)
    expect(loadDraft(s, key, DRAFT_TTL_MS)).not.toBeNull()
  })

  it('JSON corrupto devuelve null sin lanzar', () => {
    const s = fakeStorage()
    const key = draftKey('u', 'p')
    s.setItem(key, '{esto no es json')
    expect(loadDraft(s, key)).toBeNull()
  })

  it('forma inválida (sin savedAt/fields) devuelve null y limpia', () => {
    const s = fakeStorage()
    const key = draftKey('u', 'p')
    s.setItem(key, JSON.stringify({ otra: 'cosa' }))
    expect(loadDraft(s, key)).toBeNull()
    expect(s.getItem(key)).toBeNull()
  })

  it('storage null: no lanza y devuelve null', () => {
    expect(() => saveDraft(null, 'k', { a: '1' })).not.toThrow()
    expect(loadDraft(null, 'k')).toBeNull()
    expect(() => clearDraft(null, 'k')).not.toThrow()
    expect(() => purgeExpiredDrafts(null)).not.toThrow()
  })

  it('setItem que lanza (cuota llena): saveDraft no revienta', () => {
    expect(() => saveDraft(throwingStorage(), 'k', { a: '1' })).not.toThrow()
  })
})

describe('clearDraft', () => {
  it('elimina el borrador', () => {
    const s = fakeStorage()
    const key = draftKey('u', 'p')
    saveDraft(s, key, { a: '1' })
    clearDraft(s, key)
    expect(loadDraft(s, key)).toBeNull()
  })
})

describe('purgeExpiredDrafts', () => {
  it('elimina solo los borradores expirados con nuestro prefijo', () => {
    const s = fakeStorage()
    saveDraft(s, draftKey('u', 'viejo'), { a: '1' }, 0)
    saveDraft(s, draftKey('u', 'fresco'), { a: '2' }, DRAFT_TTL_MS)
    s.setItem('otra-app:key', 'no tocar')
    s.setItem(draftKey('u', 'corrupto'), '{{{')
    purgeExpiredDrafts(s, DRAFT_TTL_MS + 1)
    expect(s.getItem(draftKey('u', 'viejo'))).toBeNull()
    expect(s.getItem(draftKey('u', 'corrupto'))).toBeNull()
    expect(s.getItem(draftKey('u', 'fresco'))).not.toBeNull()
    expect(s.getItem('otra-app:key')).toBe('no tocar')
  })
})

describe('formDataToFields', () => {
  it('convierte FormData a record de strings, ignorando archivos', () => {
    const fd = new FormData()
    fd.append('diagnosis', 'Gripe')
    fd.append('symptoms', '')
    fd.append('archivo', new File(['x'], 'x.txt'))
    expect(formDataToFields(fd)).toEqual({ diagnosis: 'Gripe', symptoms: '' })
  })
})
