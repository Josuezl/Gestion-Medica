import { describe, it, expect } from 'vitest'
import { generateVerificationCode, generateBookingToken } from '@/utils/verification-code'

describe('generateVerificationCode (A1: CSPRNG)', () => {
  it('respeta el prefijo y el formato PREFIX-XXXXXXXXXX (10 base36 mayúsculas)', () => {
    expect(generateVerificationCode('MC')).toMatch(/^MC-[0-9A-Z]{10}$/)
    expect(generateVerificationCode('LAB')).toMatch(/^LAB-[0-9A-Z]{10}$/)
  })

  it('produce códigos distintos en llamadas consecutivas (no es un valor fijo)', () => {
    expect(generateVerificationCode('MC')).not.toBe(generateVerificationCode('MC'))
  })

  it('no genera colisiones en un volumen alto (10k códigos únicos)', () => {
    const set = new Set<string>()
    for (let i = 0; i < 10000; i++) set.add(generateVerificationCode('MC'))
    expect(set.size).toBe(10000)
  })
})

describe('generateBookingToken (links públicos de agendamiento)', () => {
  it('genera 24 caracteres URL-safe (base64url, sin +/= que rompan la URL)', () => {
    const token = generateBookingToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/)
  })

  it('produce tokens distintos en llamadas consecutivas', () => {
    expect(generateBookingToken()).not.toBe(generateBookingToken())
  })
})
