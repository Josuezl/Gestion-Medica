'use client'

import React, { useRef, useState } from 'react'
import { identifyPatient, getAvailability, submitBooking } from './actions'
import { weekdayOfYMD, splitFullName } from '@/utils/booking'

/**
 * Wizard público de auto-agendamiento. Pasos:
 *  1. name     → nombre completo → identifyPatient (found/not_found, sin revelar datos)
 *  2. register → solo si not_found: fecha de nacimiento, identidad (opcional) y teléfono
 *  3. calendar → días/horas disponibles (slots de 1 hora, 30 días)
 *  4. confirm  → resumen → submitBooking
 *  5. done     → código de seguimiento + link de estado (/citas/[code])
 */

type Step = 'name' | 'register' | 'calendar' | 'confirm' | 'done'

const MONTH_LABELS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DOW_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const WEEKDAY_FULL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

const TEAL = '#0d9488'

const cardStyle: React.CSSProperties = {
  maxWidth: '480px', width: '100%', backgroundColor: '#ffffff', borderRadius: '16px',
  border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.04)',
  padding: '32px 28px', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', textAlign: 'left',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', fontSize: '15px', borderRadius: '8px',
  border: '1px solid #cbd5e1', outline: 'none', color: '#0f172a', backgroundColor: '#f8fafc', boxSizing: 'border-box',
}
const primaryBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: 'white', border: 'none',
  padding: '13px 20px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '14px', width: '100%',
}
const secondaryBtn: React.CSSProperties = {
  background: 'none', color: '#64748b', border: 'none', padding: '10px', fontWeight: 600,
  cursor: 'pointer', fontSize: '13px', width: '100%',
}

/** "miércoles 8 de julio de 2026" a partir del YMD, sin pasar por Date (evita el corrimiento UTC). */
function formatYMDLong(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${WEEKDAY_FULL[weekdayOfYMD(ymd)]} ${d} de ${MONTH_LABELS[m - 1].toLowerCase()} de ${y}`
}

/** "8:00 a.m." desde 'HH:MM' (formato 24h → 12h legible para el paciente). */
function formatHour12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h < 12 ? 'a.m.' : 'p.m.'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`
}

export default function BookingWizard({ token, doctorName, clinicName, locationName }: {
  token: string
  doctorName: string
  clinicName: string
  locationName: string | null
}) {
  const [step, setStep] = useState<Step>('name')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Caja única del paso 1: se divide en nombres/apellidos solo para el registro y la ficha.
  const [fullName, setFullName] = useState('')
  // Compuerta al detectar EXACTAMENTE 3 palabras: confirmar que su nombre solo tiene 3 antes de seguir.
  const [threeWordPrompt, setThreeWordPrompt] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [isExisting, setIsExisting] = useState(false)
  const [birthDate, setBirthDate] = useState('')
  const [idCard, setIdCard] = useState('')
  const [phone, setPhone] = useState('')

  const [days, setDays] = useState<Record<string, string[]>>({})
  const [monthCursor, setMonthCursor] = useState<{ year: number; month: number } | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)

  const [trackingCode, setTrackingCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const availableDates = Object.keys(days).sort()

  const loadAvailability = async (): Promise<boolean> => {
    const res = await getAvailability(token)
    if ('error' in res) { setError(res.error); return false }
    setDays(res.days)
    const first = Object.keys(res.days).sort()[0]
    if (first) {
      const [y, m] = first.split('-').map(Number)
      setMonthCursor({ year: y, month: m - 1 })
    } else {
      setMonthCursor(null)
    }
    setSelectedDate(null)
    setSelectedTime(null)
    return true
  }

  // Ejecuta la identificación (paso 1 → calendario/registro) una vez validado el nombre.
  const runIdentify = async (split: ReturnType<typeof splitFullName>) => {
    setThreeWordPrompt(false)
    setBusy(true)
    const res = await identifyPatient(token, fullName, idCard || undefined)
    if ('error' in res) { setError(res.error); setBusy(false); return }
    if (res.status === 'found') {
      setIsExisting(true)
      if (await loadAvailability()) setStep('calendar')
    } else {
      setIsExisting(false)
      // Prefill del registro con el corte nombres/apellidos (el paciente puede corregirlo).
      setFirstName(split.firstName)
      setLastName(split.lastName)
      setStep('register')
    }
    setBusy(false)
  }

  const handleIdentify = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const split = splitFullName(fullName)
    if (split.words < 3) {
      setError('Escribe al menos tu nombre y tus dos apellidos (o tus dos nombres y un apellido), tal como aparecen en tu identidad.')
      return
    }
    // Exactamente 3 palabras: puede ser correcto (un solo nombre o un solo apellido) o faltarle uno.
    // Preguntamos antes de continuar; si confirma que solo tiene 3, procede.
    if (split.words === 3 && !threeWordPrompt) {
      setThreeWordPrompt(true)
      return
    }
    runIdentify(split)
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!birthDate) { setError('Indica tu fecha de nacimiento.'); return }
    if (!phone.trim()) { setError('Indica un número de teléfono para contactarte.'); return }
    setBusy(true)
    if (await loadAvailability()) setStep('calendar')
    setBusy(false)
  }

  const handleSubmit = async () => {
    if (!selectedDate || !selectedTime) return
    setError(null)
    setBusy(true)
    const res = await submitBooking(token, {
      // Paciente existente: el nombre tal como lo escribió en la caja única; nuevo: el corte
      // nombres/apellidos que pudo corregir en el registro.
      fullName: isExisting ? fullName : `${firstName} ${lastName}`,
      date: selectedDate,
      time: selectedTime,
      idCard: idCard || undefined,
      birthDate: isExisting ? undefined : birthDate,
      phone: isExisting ? undefined : phone,
    })
    setBusy(false)
    if ('error' in res) {
      setError(res.error)
      // El slot pudo ocuparse mientras confirmaba: recargar disponibilidad y volver al calendario.
      if (res.error.includes('ocuparse') || res.error.includes('ya no está disponible')) {
        setBusy(true)
        await loadAvailability()
        setBusy(false)
        setStep('calendar')
      }
      return
    }
    setTrackingCode(res.trackingCode)
    setStep('done')
  }

  const handleCopy = async () => {
    if (!trackingCode) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/citas/${trackingCode}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* el paciente puede copiarlo a mano */ }
  }

  // --- Calendario del mes en curso (lunes primero, días con slots habilitados) ---
  const renderMonth = () => {
    if (!monthCursor) return null
    const { year, month } = monthCursor
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const firstDow = (weekdayOfYMD(`${year}-${String(month + 1).padStart(2, '0')}-01`) + 6) % 7 // lunes=0
    const cells: (string | null)[] = [
      ...Array.from({ length: firstDow }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`),
    ]
    const monthsAvailable = new Set(availableDates.map(d => d.slice(0, 7)))
    const cursorKey = `${year}-${String(month + 1).padStart(2, '0')}`
    const sortedMonths = [...monthsAvailable].sort()
    const prevMonth = sortedMonths.filter(m => m < cursorKey).pop()
    const nextMonth = sortedMonths.find(m => m > cursorKey)

    const goToMonth = (key: string) => {
      const [y, m] = key.split('-').map(Number)
      setMonthCursor({ year: y, month: m - 1 })
    }

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <button type="button" disabled={!prevMonth} onClick={() => prevMonth && goToMonth(prevMonth)}
            style={{ background: 'none', border: 'none', cursor: prevMonth ? 'pointer' : 'default', color: prevMonth ? TEAL : '#e2e8f0', fontSize: '18px', fontWeight: 700, padding: '4px 10px' }}>‹</button>
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>{MONTH_LABELS[month]} {year}</span>
          <button type="button" disabled={!nextMonth} onClick={() => nextMonth && goToMonth(nextMonth)}
            style={{ background: 'none', border: 'none', cursor: nextMonth ? 'pointer' : 'default', color: nextMonth ? TEAL : '#e2e8f0', fontSize: '18px', fontWeight: 700, padding: '4px 10px' }}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
          {DOW_LABELS.map((d, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#94a3b8', padding: '4px 0' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {cells.map((ymd, i) => {
            if (!ymd) return <div key={`e${i}`} />
            const enabled = !!days[ymd]
            const selected = selectedDate === ymd
            return (
              <button
                key={ymd}
                type="button"
                disabled={!enabled}
                onClick={() => { setSelectedDate(ymd); setSelectedTime(null) }}
                style={{
                  padding: '8px 0', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  border: selected ? `2px solid ${TEAL}` : '1px solid transparent',
                  cursor: enabled ? 'pointer' : 'default',
                  backgroundColor: selected ? 'rgba(13,148,136,0.12)' : enabled ? '#f0fdfa' : 'transparent',
                  color: enabled ? '#0f172a' : '#cbd5e1',
                }}
              >
                {Number(ymd.slice(8))}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif', boxSizing: 'border-box' }}>
      <div style={cardStyle}>
        {/* Encabezado: médico + clínica (+sede) */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: 800, color: TEAL, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Agenda tu cita
          </h3>
          <h1 style={{ margin: '0 0 4px', fontSize: '21px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>{doctorName}</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
            {clinicName}{locationName ? ` · ${locationName}` : ''}
          </p>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        {/* Paso 1: nombre completo (caja única) + identidad opcional */}
        {step === 'name' && (
          <form onSubmit={handleIdentify} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ margin: 0, fontSize: '13.5px', color: '#64748b', lineHeight: 1.5, textAlign: 'center' }}>
              Escribe tu <strong>nombre completo</strong> (idealmente tus dos nombres y dos apellidos) tal como aparece en tu identidad.
            </p>
            <div>
              <label style={labelStyle}>Nombre completo</label>
              <input ref={nameInputRef} style={inputStyle} type="text" value={fullName} onChange={e => { setFullName(e.target.value); if (threeWordPrompt) setThreeWordPrompt(false) }} placeholder="Ej. María José López García" required maxLength={80} autoFocus />
            </div>
            <div>
              <label style={labelStyle}>Número de identidad (opcional)</label>
              <input style={inputStyle} type="text" value={idCard} onChange={e => setIdCard(e.target.value)} placeholder="0801-1990-12345" maxLength={30} />
              <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: '#94a3b8', textAlign: 'left' }}>
                Si ya eres paciente, tu identidad nos ayuda a encontrar tu expediente.
              </p>
            </div>
            {threeWordPrompt ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 14px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#92400e', lineHeight: 1.5, textAlign: 'left' }}>
                  Escribiste <strong>3 nombres</strong>. ¿Tu nombre completo tiene solo 3 (un solo nombre o un solo apellido)?
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" style={{ ...primaryBtn, flex: 1, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={() => runIdentify(splitFullName(fullName))}>
                    {busy ? 'Buscando…' : 'Sí, continuar'}
                  </button>
                  <button type="button" style={{ ...secondaryBtn, flex: 1, width: 'auto', color: TEAL, fontWeight: 700 }} disabled={busy} onClick={() => { setThreeWordPrompt(false); setTimeout(() => nameInputRef.current?.focus(), 0) }}>
                    No, me falta uno
                  </button>
                </div>
              </div>
            ) : (
              <button type="submit" style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }} disabled={busy}>
                {busy ? 'Buscando…' : 'Continuar'}
              </button>
            )}
          </form>
        )}

        {/* Paso 2: registro (solo pacientes nuevos) */}
        {step === 'register' && (
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '10px 14px', backgroundColor: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '8px', fontSize: '13px', color: '#115e59', lineHeight: 1.5 }}>
              No encontramos un expediente con ese nombre. Completa tus datos para registrarte — te tomará un minuto.
            </div>
            <div>
              <label style={labelStyle}>Nombres</label>
              <input style={inputStyle} type="text" value={firstName} onChange={e => setFirstName(e.target.value)} required maxLength={60} />
            </div>
            <div>
              <label style={labelStyle}>Apellidos</label>
              <input style={inputStyle} type="text" value={lastName} onChange={e => setLastName(e.target.value)} required maxLength={60} />
            </div>
            <div>
              <label style={labelStyle}>Fecha de nacimiento</label>
              <input style={inputStyle} type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} required max={new Date().toISOString().slice(0, 10)} min="1900-01-01" />
            </div>
            <div>
              <label style={labelStyle}>Número de identidad (opcional)</label>
              <input style={inputStyle} type="text" value={idCard} onChange={e => setIdCard(e.target.value)} placeholder="0801-1990-12345" maxLength={30} />
            </div>
            <div>
              <label style={labelStyle}>Teléfono</label>
              <input style={inputStyle} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9999-9999" required maxLength={20} />
            </div>
            <button type="submit" style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }} disabled={busy}>
              {busy ? 'Cargando…' : 'Continuar'}
            </button>
            <button type="button" style={secondaryBtn} onClick={() => { setStep('name'); setError(null) }}>← Volver a buscar mi nombre</button>
          </form>
        )}

        {/* Paso 3: calendario */}
        {step === 'calendar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {isExisting && (
              <div style={{ padding: '10px 14px', backgroundColor: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '8px', fontSize: '13px', color: '#115e59', lineHeight: 1.5 }}>
                ¡Te encontramos, {(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '')(fullName.trim().split(/\s+/)[0] || '')}! Elige el día y la hora de tu cita.
              </div>
            )}
            {availableDates.length === 0 ? (
              <p style={{ margin: 0, fontSize: '14px', color: '#64748b', textAlign: 'center', lineHeight: 1.6 }}>
                Por el momento no hay horarios disponibles para agendar en línea.
                Comunícate directamente con la clínica.
              </p>
            ) : (
              <>
                {renderMonth()}
                {selectedDate && (
                  <div>
                    <label style={labelStyle}>Horas disponibles — {formatYMDLong(selectedDate)}</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '6px' }}>
                      {(days[selectedDate] || []).map(hhmm => (
                        <button
                          key={hhmm}
                          type="button"
                          onClick={() => setSelectedTime(hhmm)}
                          style={{
                            padding: '9px 4px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                            border: selectedTime === hhmm ? `2px solid ${TEAL}` : '1px solid #cbd5e1',
                            backgroundColor: selectedTime === hhmm ? 'rgba(13,148,136,0.12)' : '#ffffff',
                            color: '#0f172a',
                          }}
                        >
                          {formatHour12(hhmm)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  style={{ ...primaryBtn, opacity: selectedDate && selectedTime && !busy ? 1 : 0.5 }}
                  disabled={!selectedDate || !selectedTime || busy}
                  onClick={() => { setError(null); setStep('confirm') }}
                >
                  Continuar
                </button>
              </>
            )}
            <button type="button" style={secondaryBtn} onClick={() => { setStep(isExisting ? 'name' : 'register'); setError(null) }}>← Volver</button>
          </div>
        )}

        {/* Paso 4: confirmación */}
        {step === 'confirm' && selectedDate && selectedTime && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', textAlign: 'center' }}>Confirma tu cita</h2>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', fontSize: '14px', color: '#0f172a', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div><strong>Paciente:</strong> {isExisting ? fullName.trim() : `${firstName} ${lastName}`}</div>
              <div><strong>Médico:</strong> {doctorName}</div>
              <div><strong>Lugar:</strong> {clinicName}{locationName ? ` · ${locationName}` : ''}</div>
              <div><strong>Fecha:</strong> {formatYMDLong(selectedDate)}</div>
              <div><strong>Hora:</strong> {formatHour12(selectedTime)}</div>
            </div>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b', lineHeight: 1.5, textAlign: 'center' }}>
              Tu cita quedará <strong>pendiente de aprobación</strong> por la clínica.
              Recibirás la confirmación por WhatsApp o teléfono.
            </p>
            <button type="button" style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={handleSubmit}>
              {busy ? 'Agendando…' : 'Agendar cita'}
            </button>
            <button type="button" style={secondaryBtn} disabled={busy} onClick={() => { setStep('calendar'); setError(null) }}>← Cambiar fecha u hora</button>
          </div>
        )}

        {/* Paso 5: listo */}
        {step === 'done' && trackingCode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(13, 148, 136, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', color: TEAL }}>
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>¡Solicitud enviada!</h2>
            <p style={{ margin: 0, fontSize: '13.5px', color: '#64748b', lineHeight: 1.6 }}>
              Tu cita del <strong>{selectedDate ? formatYMDLong(selectedDate) : ''}</strong> a las <strong>{selectedTime ? formatHour12(selectedTime) : ''}</strong> quedó
              <strong> pendiente de aprobación</strong>. Guarda este código para consultar su estado:
            </p>
            <div style={{ padding: '14px', backgroundColor: '#f8fafc', border: '1px dashed #94a3b8', borderRadius: '10px', fontFamily: 'monospace', fontSize: '20px', fontWeight: 800, letterSpacing: '0.08em', color: '#0f172a' }}>
              {trackingCode}
            </div>
            <a
              href={`/citas/${trackingCode}`}
              style={{ ...primaryBtn, display: 'block', textDecoration: 'none', textAlign: 'center', boxSizing: 'border-box' }}
            >
              Ver estado de mi cita
            </a>
            <button type="button" style={secondaryBtn} onClick={handleCopy}>
              {copied ? '¡Enlace copiado!' : 'Copiar enlace de estado'}
            </button>
          </div>
        )}
      </div>

      <p style={{ margin: '16px 0 0', fontSize: '11px', color: '#94a3b8' }}>
        Página protegida con cifrado SSL · Sus datos se usan solo para gestionar su cita.
      </p>
    </div>
  )
}
