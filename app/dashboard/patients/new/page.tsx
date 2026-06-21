'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createPatient, suggestNextRecordNumber } from '../actions'
import { isPediatric as isPediatricAge } from '@/utils/age'
import { 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar, 
  Activity, 
  AlertCircle,
  FileText,
  Loader2,
  ChevronLeft,
  Save
} from 'lucide-react'

export default function NewPatientPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Aviso de posible duplicado (no bloquea: se puede guardar de todas formas).
  const [duplicate, setDuplicate] = useState<{ id: string; name: string; birthDate: string } | null>(null)
  const pendingForm = useRef<FormData | null>(null)
  // Se detecta automáticamente por la fecha de nacimiento (menor de 19 años).
  const [isPediatric, setIsPediatric] = useState(false)

  // Pre-carga del nombre cuando se llega desde "Agendar cita" con un paciente no registrado
  // (/dashboard/patients/new?nombre=...). Controlado + efecto de montaje para no romper la hidratación.
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  // N° de expediente: se sugiere el siguiente (último + 1) al abrir el formulario.
  const [recordNumber, setRecordNumber] = useState('')
  const [recordSuggested, setRecordSuggested] = useState(false)
  useEffect(() => {
    const nombre = new URLSearchParams(window.location.search).get('nombre')?.trim()
    if (nombre) {
      const parts = nombre.split(/\s+/)
      setFirstName(parts[0] || '')
      setLastName(parts.slice(1).join(' '))
    }
    suggestNextRecordNumber()
      .then(next => { if (next) { setRecordNumber(next); setRecordSuggested(true) } })
      .catch(() => {})
  }, [])

  function handleBirthDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    setIsPediatric(isPediatricAge(e.target.value))
  }

  async function submit(formData: FormData, force: boolean) {
    setError(null)
    setDuplicate(null)
    setLoading(true)

    const result: any = await createPatient(formData, force)

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
        <a href="/dashboard/patients" style={styles.backLink}>
          <ChevronLeft size={16} />
          Volver a Pacientes
        </a>
        <h2 style={styles.title}>Registrar Nuevo Paciente</h2>
        <p style={styles.subtitle}>Crea la ficha y el expediente inicial del paciente</p>
      </div>

      {error && <div style={styles.errorAlert}>{error}</div>}

      {duplicate && (
        <div style={styles.dupAlert}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Ya existe un paciente parecido:</strong> {duplicate.name}
              {duplicate.birthDate ? ` (nac. ${duplicate.birthDate})` : ''}. ¿Es la misma persona?
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                <a href={`/dashboard/patients/${duplicate.id}`} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                  Ver ese paciente
                </a>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  disabled={loading}
                  onClick={() => { if (pendingForm.current) submit(pendingForm.current, true) }}
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : 'Guardar de todas formas'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={styles.form}>
        <div className="responsive-main-side">
          {/* Main Card: Demographic Info */}
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
                  placeholder="Ej. Martínez"
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
                  Género
                </label>
                <select className="form-input" id="gender" name="gender">
                  <option value="">Selecciona...</option>
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
                <div style={styles.phoneInputWrapper}>
                  <span style={styles.phoneAddon}>+504</span>
                  <input
                    className="form-input"
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="9988-7766"
                    pattern="[389][0-9]{7}"
                    title="Por favor ingresa un número celular de Honduras de 8 dígitos que comience con 3, 8 o 9"
                    style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                  />
                </div>
                <p style={styles.inputHelp}>Opcional — número de Honduras de 8 dígitos para recordatorios y recetas. Puedes agregarlo después.</p>
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

          {/* Right Card: Medical History (Antecedentes) */}
          <div className="card" style={styles.formCard}>
            <h3 style={styles.sectionTitle}>
              <AlertCircle size={18} color="#ef4444" />
              Alergias Conocidas
            </h3>
            <div className="form-group">
              <textarea
                className="form-input"
                id="allergies"
                name="allergies"
                defaultValue="Ninguna conocida"
                placeholder="Especifica medicamentos, alimentos, polen, etc."
                rows={2}
                style={{ resize: 'vertical', borderLeft: '3px solid #ef4444' }}
              />
            </div>

            <h3 style={{ ...styles.sectionTitle, marginTop: '2rem' }}>
              <Activity size={18} color="var(--secondary)" />
              Historial Clínico (Antecedentes)
            </h3>

            <div className="form-group">
              <label className="form-label" htmlFor="pathological_history">
                Antecedentes Patológicos
              </label>
              <textarea
                className="form-input"
                id="pathological_history"
                name="pathological_history"
                placeholder="Enfermedades crónicas (hipertensión, diabetes), cirugías previas, hospitalizaciones..."
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="non_pathological_history">
                Antecedentes No Patológicos
              </label>
              <textarea
                className="form-input"
                id="non_pathological_history"
                name="non_pathological_history"
                placeholder="Estilo de vida, hábitos alimenticios, ejercicio, tabaco, alcohol, vacunas..."
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="family_history">
                Antecedentes Heredofamiliares
              </label>
              <textarea
                className="form-input"
                id="family_history"
                name="family_history"
                placeholder="Enfermedades en familiares cercanos (cáncer, diabetes, cardiopatías)..."
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>
            
            <div style={styles.actionRow}>
              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={loading} 
                style={{ width: '100%', gap: '0.5rem', marginTop: '1rem' }}
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
          </div>
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
