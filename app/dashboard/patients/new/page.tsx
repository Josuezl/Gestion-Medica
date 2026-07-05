'use client'

import React, { Suspense, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createPatient, getRecordNumberConfig } from '../actions'
import { isPediatric as isPediatricAge } from '@/utils/age'
import {
  User,
  Phone,
  Activity,
  AlertCircle,
  Loader2,
  ChevronLeft,
  Save
} from 'lucide-react'

// useSearchParams exige un límite de Suspense durante el prerender de la página.
export default function NewPatientPage() {
  return (
    <Suspense fallback={null}>
      <NewPatientForm />
    </Suspense>
  )
}

function NewPatientForm() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Posible duplicado. `block: true` => duplicado exacto (nombre+fecha+género): NO se puede
  // guardar de todas formas. `block: false` => solo aviso, se puede confirmar y guardar.
  const [duplicate, setDuplicate] = useState<{ id: string; name: string; birthDate: string | null; block: boolean } | null>(null)
  const pendingForm = useRef<FormData | null>(null)
  // Se detecta automáticamente por la fecha de nacimiento (menor de 19 años).
  const [isPediatric, setIsPediatric] = useState(false)

  // Pre-carga del nombre cuando se llega desde "Agendar cita" con un paciente no registrado
  // (/dashboard/patients/new?nombre=...).
  const searchParams = useSearchParams()
  const prefillName = (searchParams.get('nombre') || '').trim()
  const prefillParts = prefillName ? prefillName.split(/\s+/) : []
  const [firstName, setFirstName] = useState(prefillParts[0] || '')
  const [lastName, setLastName] = useState(prefillParts.slice(1).join(' '))
  // N° de expediente: solo se muestra a las clínicas con el flag activo (hoy Complejo Médico San
  // Martín). Si está activo, se sugiere el siguiente (último + 1) al abrir el formulario.
  const [recordNumber, setRecordNumber] = useState('')
  const [recordSuggested, setRecordSuggested] = useState(false)
  const [showRecordNumber, setShowRecordNumber] = useState(false)
  useEffect(() => {
    getRecordNumberConfig()
      .then(cfg => {
        setShowRecordNumber(cfg.enabled)
        if (cfg.enabled && cfg.suggested) { setRecordNumber(cfg.suggested); setRecordSuggested(true) }
      })
      .catch(() => {})
  }, [])

  function handleBirthDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    setIsPediatric(isPediatricAge(e.target.value))
  }

  async function submit(formData: FormData, force: boolean) {
    setError(null)
    setDuplicate(null)
    setLoading(true)

    const result = await createPatient(formData, force)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    if (result?.duplicate) {
      pendingForm.current = formData
      setDuplicate(result.duplicate)
      setLoading(false)
      return
    }
    // Éxito: el server action redirige al detalle; no hay nada más que hacer aquí.
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await submit(new FormData(event.currentTarget), false)
  }

  return (
    <div style={styles.container}>
      {/* Navigation and Title */}
      <div style={styles.headerRow}>
        <Link href="/dashboard/patients" style={styles.backLink}>
          <ChevronLeft size={16} />
          Volver a Pacientes
        </Link>
        <h2 style={styles.title}>Registrar Nuevo Paciente</h2>
        <p style={styles.subtitle}>Crea la ficha y el expediente inicial del paciente</p>
      </div>

      {error && <div style={styles.errorAlert}>{error}</div>}

      {duplicate && (
        <div style={duplicate.block ? styles.dupBlockAlert : styles.dupAlert}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              {duplicate.block ? (
                <>
                  <strong>Este paciente ya está registrado:</strong> {duplicate.name}
                  {duplicate.birthDate ? ` (nac. ${duplicate.birthDate})` : ''}. Coincide nombre,
                  fecha de nacimiento y género, así que no se puede registrar otra vez. Abre su expediente.
                </>
              ) : (
                <>
                  <strong>Ya existe un paciente parecido:</strong> {duplicate.name}
                  {duplicate.birthDate ? ` (nac. ${duplicate.birthDate})` : ''}. ¿Es la misma persona?
                </>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                <Link href={`/dashboard/patients/${duplicate.id}`} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                  Ver ese paciente
                </Link>
                {/* "Guardar de todas formas" SOLO para avisos (block=false). En un bloqueo no se ofrece;
                    el servidor además lo rechaza aunque se forzara. */}
                {!duplicate.block && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    disabled={loading}
                    onClick={() => { if (pendingForm.current) submit(pendingForm.current, true) }}
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : 'Guardar de todas formas'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Card único: datos demográficos y de contacto. Los antecedentes clínicos (alergias e
            historial) ya NO se piden aquí: por privacidad, solo el médico los registra en la consulta. */}
        <div className="card" style={styles.formCard}>
            <h3 style={styles.sectionTitle}>
              <User size={18} color="var(--primary)" />
              Datos Personales y Demográficos
            </h3>

            <div className="responsive-2col">
              <div className="form-group">
                <label className="form-label" htmlFor="first_name">
                  Nombre(s) *
                </label>
                <input
                  className="form-input"
                  id="first_name"
                  name="first_name"
                  type="text"
                  placeholder="Ej. Carlos Roberto"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="last_name">
                  Apellido(s) *
                </label>
                <input
                  className="form-input"
                  id="last_name"
                  name="last_name"
                  type="text"
                  placeholder="Ej. Martínez Pérez"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="id_card">
                  N° de Identidad (DNI)
                </label>
                <input
                  className="form-input"
                  id="id_card"
                  name="id_card"
                  type="text"
                  placeholder="Ej. 0801-1990-12345"
                />
              </div>

              {showRecordNumber && (
                <div className="form-group">
                  <label className="form-label" htmlFor="record_number">
                    N° de Expediente
                  </label>
                  <input
                    className="form-input"
                    id="record_number"
                    name="record_number"
                    type="text"
                    placeholder="Ej. EXP-00123"
                    value={recordNumber}
                    onChange={(e) => { setRecordNumber(e.target.value); setRecordSuggested(false) }}
                  />
                  <p style={styles.inputHelp}>
                    {recordSuggested
                      ? 'Sugerido (último N° + 1). Puedes cambiarlo.'
                      : 'Opcional — si tu clínica maneja número de expediente.'}
                  </p>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="birth_date">
                  Fecha de Nacimiento *
                </label>
                <input
                  className="form-input"
                  id="birth_date"
                  name="birth_date"
                  type="date"
                  required
                  onChange={handleBirthDateChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="gender">
                  Género *
                </label>
                <select className="form-input" id="gender" name="gender" required defaultValue="">
                  <option value="" disabled>Selecciona...</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="blood_type">
                  Tipo de Sangre
                </label>
                <select className="form-input" id="blood_type" name="blood_type">
                  <option value="">Selecciona...</option>
                  <option value="O+">O Rh Positivo (O+)</option>
                  <option value="O-">O Rh Negativo (O-)</option>
                  <option value="A+">A Rh Positivo (A+)</option>
                  <option value="A-">A Rh Negativo (A-)</option>
                  <option value="B+">B Rh Positivo (B+)</option>
                  <option value="B-">B Rh Negativo (B-)</option>
                  <option value="AB+">AB Rh Positivo (AB+)</option>
                  <option value="AB-">AB Rh Negativo (AB-)</option>
                </select>
              </div>
              {/* El servidor deriva is_pediatric de la fecha de nacimiento (menor de 19 años);
                  este estado solo controla la vista de los campos de padres. */}

              {isPediatric && (
                <>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      padding: '0.75rem 1rem',
                      backgroundColor: 'rgba(13, 148, 136, 0.08)',
                      border: '1px solid rgba(13, 148, 136, 0.25)',
                      borderRadius: '8px',
                      color: '#0f766e',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}>
                      <Activity size={16} color="#0d9488" />
                      Se identificó un paciente pediátrico — completa los datos de los padres.
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="father_name">
                      Nombre del Padre
                    </label>
                    <input
                      className="form-input"
                      id="father_name"
                      name="father_name"
                      type="text"
                      placeholder="Ej. Carlos Hernández"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="mother_name">
                      Nombre de la Madre
                    </label>
                    <input
                      className="form-input"
                      id="mother_name"
                      name="mother_name"
                      type="text"
                      placeholder="Ej. María Vargas"
                    />
                  </div>
                </>
              )}
            </div>

            <h3 style={{ ...styles.sectionTitle, marginTop: '2rem' }}>
              <Phone size={18} color="var(--primary)" />
              Contacto y Ubicación
            </h3>

            <div className="responsive-2col">
              <div className="form-group">
                <label className="form-label" htmlFor="phone">
                  Teléfono Celular (WhatsApp)
                </label>
                <input
                  className="form-input"
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="Ej. 9988-7766 o +1 555 123 4567"
                />
                <p style={styles.inputHelp}>Opcional — local de 8 dígitos (se asume Honduras +504) o internacional con código de país (+…). Para recordatorios y recetas.</p>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="email">
                  Correo Electrónico
                </label>
                <input
                  className="form-input"
                  id="email"
                  name="email"
                  type="email"
                  placeholder="paciente@correo.com"
                />
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '0.5rem' }}>
              <label className="form-label" htmlFor="address">
                Dirección Residencial
              </label>
              <textarea
                className="form-input"
                id="address"
                name="address"
                placeholder="Dirección completa del paciente..."
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ gap: '0.5rem', minWidth: '260px', justifyContent: 'center' }}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                Guardando Paciente...
              </>
            ) : (
              <>
                <Save size={18} />
                Guardar y Abrir Expediente
              </>
            )}
          </button>
        </div>
      </form>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  headerRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    color: 'var(--primary)',
    fontSize: '0.85rem',
    fontWeight: '600',
    textDecoration: 'none',
    marginBottom: '0.5rem',
    width: 'fit-content',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: '700',
  },
  subtitle: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
  },
  errorAlert: {
    padding: '0.75rem 1rem',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '8px',
    color: '#f87171',
    fontSize: '0.85rem',
  },
  dupAlert: {
    padding: '0.85rem 1rem',
    backgroundColor: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: '8px',
    color: '#92400e',
    fontSize: '0.88rem',
    marginBottom: '1rem',
  },
  dupBlockAlert: {
    padding: '0.85rem 1rem',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    borderRadius: '8px',
    color: '#b91c1c',
    fontSize: '0.88rem',
    marginBottom: '1rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1fr',
    gap: '1.5rem',
    alignItems: 'start',
  },
  formCard: {
    padding: '2rem',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '1.25rem',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '0.5rem',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
  },
  phoneInputWrapper: {
    display: 'flex',
    alignItems: 'center',
  },
  phoneAddon: {
    padding: '0.75rem 1rem',
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    borderRight: 'none',
    borderTopLeftRadius: 'var(--radius-md)',
    borderBottomLeftRadius: 'var(--radius-md)',
    fontSize: '0.95rem',
    color: 'var(--text-muted)',
    fontWeight: '600',
  },
  inputHelp: {
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
    marginTop: '0.25rem',
  },
  actionRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
}
