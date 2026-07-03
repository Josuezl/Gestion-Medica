import { describe, it, expect } from 'vitest'
import { validateVitals, isValidAppointmentStatus, VALID_APPOINTMENT_STATUSES, isCreatableAppointmentStatus, sanitizeName, normalizeName, classifyNameDobDuplicate } from '@/utils/validation'

describe('validateVitals', () => {
  it('devuelve null cuando no se ingresó ningún vital', () => {
    expect(validateVitals({})).toBeNull()
  })

  it('devuelve null con valores normales', () => {
    expect(validateVitals({ temperature: 36.5, weight: 70, height: 165, heartRate: 72, respiratoryRate: 16, oxygenSaturation: 98 })).toBeNull()
  })

  it('acepta frecuencia respiratoria normal y rechaza un valor imposible', () => {
    expect(validateVitals({ respiratoryRate: 18 })).toBeNull()
    expect(validateVitals({ respiratoryRate: 300 })).toContain('Frecuencia respiratoria')
  })

  it('ignora los valores null/undefined', () => {
    expect(validateVitals({ weight: null, temperature: undefined })).toBeNull()
  })

  it('rechaza peso fuera de rango (p. ej. gramos) y nombra el campo', () => {
    const err = validateVitals({ weight: 75000 })
    expect(err).toContain('Peso')
  })

  it('rechaza temperatura imposible', () => {
    expect(validateVitals({ temperature: 50 })).toContain('Temperatura')
  })

  it('rechaza SpO2 > 100', () => {
    expect(validateVitals({ oxygenSaturation: 120 })).toContain('SpO2')
  })

  it('respeta los límites inclusivos (600 kg ok, 600.5 no)', () => {
    expect(validateVitals({ weight: 600 })).toBeNull()
    expect(validateVitals({ weight: 600.5 })).not.toBeNull()
  })

  it('rechaza NaN', () => {
    expect(validateVitals({ heartRate: NaN })).toContain('Ritmo cardiaco')
  })
})

describe('isValidAppointmentStatus', () => {
  it('acepta los estados válidos', () => {
    for (const s of VALID_APPOINTMENT_STATUSES) expect(isValidAppointmentStatus(s)).toBe(true)
  })

  it('incluye PENDING_REVIEW (solicitudes del portal público)', () => {
    expect(isValidAppointmentStatus('PENDING_REVIEW')).toBe(true)
    expect(VALID_APPOINTMENT_STATUSES).toHaveLength(8)
  })

  it('rechaza estados inválidos, vacíos y de distinta capitalización', () => {
    expect(isValidAppointmentStatus('HACKEADO')).toBe(false)
    expect(isValidAppointmentStatus('')).toBe(false)
    expect(isValidAppointmentStatus('completed')).toBe(false)
  })
})

describe('isCreatableAppointmentStatus', () => {
  it('permite crear citas en estados previos o en curso', () => {
    expect(isCreatableAppointmentStatus('PENDING')).toBe(true)
    expect(isCreatableAppointmentStatus('CONFIRMED')).toBe(true)
    expect(isCreatableAppointmentStatus('WAITING')).toBe(true)
    expect(isCreatableAppointmentStatus('IN_PROGRESS')).toBe(true)
  })

  it('no permite crear citas ya como Realizada, No se presentó o Cancelada', () => {
    expect(isCreatableAppointmentStatus('COMPLETED')).toBe(false)
    expect(isCreatableAppointmentStatus('NO_SHOW')).toBe(false)
    expect(isCreatableAppointmentStatus('CANCELLED')).toBe(false)
  })

  it('no permite crear citas como "Por aprobar" desde la agenda (solo el portal público las crea)', () => {
    expect(isCreatableAppointmentStatus('PENDING_REVIEW')).toBe(false)
  })
})

describe('sanitizeName', () => {
  it('conserva nombres con acentos, apóstrofo y guion', () => {
    expect(sanitizeName('José María O\'Brien-López')).toBe('José María O\'Brien-López')
  })

  it('quita dígitos, emojis y caracteres extraños (conserva letras)', () => {
    expect(sanitizeName('Ju4n 99 #! 🤖 Pérez')).toBe('Ju n Pérez')
  })

  it('colapsa espacios y recorta', () => {
    expect(sanitizeName('   Ana    Sofía   ')).toBe('Ana Sofía')
  })

  it('usa el fallback cuando no queda nada útil', () => {
    expect(sanitizeName('1234 😀', 'Paciente Nuevo')).toBe('Paciente Nuevo')
    expect(sanitizeName(null)).toBe('Paciente')
  })

  it('limita la longitud a 60', () => {
    expect(sanitizeName('a'.repeat(200)).length).toBe(60)
  })
})

describe('normalizeName (para detectar duplicados)', () => {
  it('quita acentos, mayúsculas y espacios extra', () => {
    expect(normalizeName('  José  PÉREZ ')).toBe('jose perez')
    expect(normalizeName('María José Hernández')).toBe('maria jose hernandez')
  })

  it('dos escrituras del mismo nombre coinciden', () => {
    expect(normalizeName('Juan Peréz')).toBe(normalizeName('JUAN PEREZ'))
    expect(normalizeName('Ana  Gómez')).toBe(normalizeName('ana gomez'))
  })

  it('nombres distintos no coinciden', () => {
    expect(normalizeName('Juan Perez') === normalizeName('Juan Peralta')).toBe(false)
  })

  it('tolera null/undefined', () => {
    expect(normalizeName(null)).toBe('')
    expect(normalizeName(undefined)).toBe('')
  })
})

describe('classifyNameDobDuplicate (bloqueo vs aviso de duplicados)', () => {
  // Los candidatos ya vienen filtrados por la MISMA fecha de nacimiento (y misma clínica).
  const candidate = (over: Partial<{ id: string; first_name: string; last_name: string; birth_date: string; gender: string }> = {}) => ({
    id: 'p1', first_name: 'GEMA CAMILA', last_name: 'AGUILAR GARAY', birth_date: '2026-06-11', gender: 'F', ...over,
  })

  it('mismo nombre + mismo género => BLOQUEO (block=true)', () => {
    const r = classifyNameDobDuplicate([candidate()], 'GEMA CAMILA', 'AGUILAR GARAY', 'F')
    expect(r).not.toBeNull()
    expect(r!.block).toBe(true)
    expect(r!.id).toBe('p1')
  })

  it('caso real GEMA: tolera espacios extra/dobles y sigue bloqueando', () => {
    const r = classifyNameDobDuplicate([candidate()], 'GEMA CAMILA ', ' AGUILAR GARAY', 'F')
    expect(r?.block).toBe(true)
  })

  it('tolera acentos y mayúsculas en el nombre', () => {
    const r = classifyNameDobDuplicate([candidate({ first_name: 'José', last_name: 'Pérez' })], 'JOSE', 'PEREZ', 'M')
    // género del candidato es F por el default; lo sobreescribimos para que coincida
    const r2 = classifyNameDobDuplicate([candidate({ first_name: 'José', last_name: 'Pérez', gender: 'M' })], 'jose', 'perez', 'M')
    expect(r2?.block).toBe(true)
    expect(r).not.toBeNull()
  })

  it('mismo nombre pero género distinto => AVISO, no bloqueo (block=false)', () => {
    const r = classifyNameDobDuplicate([candidate({ gender: 'M' })], 'GEMA CAMILA', 'AGUILAR GARAY', 'F')
    expect(r).not.toBeNull()
    expect(r!.block).toBe(false)
  })

  it('nombre distinto (p. ej. gemelos con otro nombre) => null', () => {
    const r = classifyNameDobDuplicate([candidate({ first_name: 'SOFIA ANDREA' })], 'GEMA CAMILA', 'AGUILAR GARAY', 'F')
    expect(r).toBeNull()
  })

  it('sin candidatos => null', () => {
    expect(classifyNameDobDuplicate([], 'GEMA CAMILA', 'AGUILAR GARAY', 'F')).toBeNull()
  })

  it('si hay varios, prefiere el de bloqueo (mismo nombre+género) sobre el aviso', () => {
    const aviso = candidate({ id: 'aviso', gender: 'M' })
    const bloqueo = candidate({ id: 'bloqueo', gender: 'F' })
    const r = classifyNameDobDuplicate([aviso, bloqueo], 'GEMA CAMILA', 'AGUILAR GARAY', 'F')
    expect(r!.id).toBe('bloqueo')
    expect(r!.block).toBe(true)
  })

  it('expone nombre y fecha para el mensaje al usuario', () => {
    const r = classifyNameDobDuplicate([candidate()], 'GEMA CAMILA', 'AGUILAR GARAY', 'F')
    expect(r!.name).toBe('GEMA CAMILA AGUILAR GARAY')
    expect(r!.birthDate).toBe('2026-06-11')
  })
})
