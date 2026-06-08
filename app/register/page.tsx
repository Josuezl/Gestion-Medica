'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { signup, getInvitationDetails } from '../auth/actions'
import { Stethoscope, Lock, Mail, User, Building, Landmark, Award, Loader2, ArrowRight } from 'lucide-react'
import { useSearchParams } from 'next/navigation'

function RegisterPageContent() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [invitationLoading, setInvitationLoading] = useState(false)
  const [invitationData, setInvitationData] = useState<any>(null)
  
  const searchParams = useSearchParams()
  const inviteToken = searchParams?.get('invite')

  useEffect(() => {
    async function loadInvite() {
      if (!inviteToken) return
      setInvitationLoading(true)
      const res = await getInvitationDetails(inviteToken)
      if (res.error) {
        setError(res.error)
      } else {
        setInvitationData(res)
      }
      setInvitationLoading(false)
    }
    loadInvite()
  }, [inviteToken])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(event.currentTarget)
    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirmPassword') as string

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      setLoading(false)
      return
    }

    const result = await signup(formData)

    if (result && result.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  if (invitationLoading) {
    return (
      <div style={{ ...styles.container, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Loader2 size={32} className="animate-spin" color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.bubble1}></div>
      <div style={styles.bubble2}></div>

      <div className="card-glass animate-fade-in" style={styles.card}>
        <div style={styles.logoHeader}>
          <div style={styles.logoIconContainer}>
            <Stethoscope size={32} color="var(--primary)" />
          </div>
          <h1 style={styles.appName}>MedConnect</h1>
          <p style={styles.tagline}>
            {invitationData ? 'Únete a tu equipo médico' : 'Crea tu cuenta de consultorio'}
          </p>
        </div>

        <h2 style={styles.title}>
          {invitationData ? `Invitación a ${invitationData.clinicName}` : 'Registrar Clínica'}
        </h2>
        <p style={styles.subtitle}>
          {invitationData 
            ? `Has sido invitado como ${invitationData.role === 'DOCTOR' ? 'Médico' : 'Asistente'}` 
            : 'Completa los datos para iniciar tu plataforma médica'}
        </p>

        {error && <div style={styles.errorAlert}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          {inviteToken && <input type="hidden" name="invite_token" value={inviteToken} />}
          
          {!invitationData && (
            <>
              <div style={styles.sectionTitle}>Datos del Consultorio</div>
              
              <div className="form-group">
                <label className="form-label" htmlFor="clinicName">
                  Nombre de la Clínica o Consultorio
                </label>
                <div style={styles.inputWrapper}>
                  <Building size={18} style={styles.inputIcon} />
                  <input
                    className="form-input"
                    id="clinicName"
                    name="clinicName"
                    type="text"
                    placeholder="Ej. Clínica Médica del Valle"
                    required
                    style={styles.inputWithIcon}
                  />
                </div>
              </div>
            </>
          )}

          <div style={styles.sectionTitle}>
            {invitationData ? 'Tus Datos Personales' : 'Datos Profesionales del Médico Administrador'}
          </div>

          <div style={styles.grid}>
            <div className="form-group">
              <label className="form-label" htmlFor="firstName">
                Nombre(s)
              </label>
              <div style={styles.inputWrapper}>
                <User size={18} style={styles.inputIcon} />
                <input
                  className="form-input"
                  id="firstName"
                  name="firstName"
                  type="text"
                  placeholder="Ej. Carlos"
                  required
                  style={styles.inputWithIcon}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="lastName">
                Apellido(s)
              </label>
              <div style={styles.inputWrapper}>
                <User size={18} style={styles.inputIcon} />
                <input
                  className="form-input"
                  id="lastName"
                  name="lastName"
                  type="text"
                  placeholder="Ej. Rivera"
                  required
                  style={styles.inputWithIcon}
                />
              </div>
            </div>
          </div>

          <div style={styles.grid}>
            <div className="form-group">
              <label className="form-label" htmlFor="specialty">
                Especialidad Médica
              </label>
              <div style={styles.inputWrapper}>
                <Award size={18} style={styles.inputIcon} />
                <input
                  className="form-input"
                  id="specialty"
                  name="specialty"
                  type="text"
                  placeholder="Ej. Pediatría, Dermatología"
                  defaultValue={invitationData?.specialty || ''}
                  required={invitationData?.role !== 'ASSISTANT'}
                  style={styles.inputWithIcon}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="professionalId">
                N° de Colegiación (CMH Honduras)
              </label>
              <div style={styles.inputWrapper}>
                <Landmark size={18} style={styles.inputIcon} />
                <input
                  className="form-input"
                  id="professionalId"
                  name="professionalId"
                  type="text"
                  placeholder="Ej. CMH-8942"
                  required={invitationData?.role !== 'ASSISTANT'}
                  style={styles.inputWithIcon}
                />
              </div>
            </div>
          </div>

          <div style={styles.sectionTitle}>Credenciales de Acceso</div>

          <div className="form-group">
            <label className="form-label" htmlFor="email">
              Correo Electrónico
            </label>
            <div style={styles.inputWrapper}>
              <Mail size={18} style={styles.inputIcon} />
              <input
                className="form-input"
                id="email"
                name="email"
                type="email"
                placeholder="doctor@ejemplo.com"
                defaultValue={invitationData?.email || ''}
                readOnly={!!invitationData}
                required
                style={{ ...styles.inputWithIcon, backgroundColor: invitationData ? '#f1f5f9' : '#ffffff' }}
              />
            </div>
          </div>

          <div style={styles.grid}>
            <div className="form-group">
              <label className="form-label" htmlFor="password">
                Contraseña
              </label>
              <div style={styles.inputWrapper}>
                <Lock size={18} style={styles.inputIcon} />
                <input
                  className="form-input"
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  required
                  style={styles.inputWithIcon}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirmPassword">
                Confirmar Contraseña
              </label>
              <div style={styles.inputWrapper}>
                <Lock size={18} style={styles.inputIcon} />
                <input
                  className="form-input"
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="Repite la contraseña"
                  required
                  style={styles.inputWithIcon}
                />
              </div>
            </div>
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', gap: '0.75rem', marginTop: '1.5rem' }}>
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                Creando Cuenta...
              </>
            ) : (
              <>
                {invitationData ? 'Crear Cuenta y Entrar' : 'Registrar Clínica y Entrar'}
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div style={styles.divider}></div>

        <p style={styles.footerText}>
          ¿Ya tienes una clínica registrada?{' '}
          <a href="/login" style={styles.loginLink}>
            Inicia sesión aquí
          </a>
        </p>
      </div>

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
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at 10% 20%, rgba(79, 70, 229, 0.08) 0%, rgba(9, 13, 22, 1) 90%)',
    position: 'relative',
    overflow: 'hidden',
    padding: '2rem 1.5rem',
  },
  bubble1: {
    position: 'absolute',
    width: '350px',
    height: '350px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(13,148,136,0.1) 0%, rgba(13,148,136,0) 70%)',
    top: '-80px',
    right: '-50px',
    zIndex: 0,
  },
  bubble2: {
    position: 'absolute',
    width: '500px',
    height: '500px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(79,70,229,0.1) 0%, rgba(79,70,229,0) 70%)',
    bottom: '-150px',
    left: '-100px',
    zIndex: 0,
  },
  card: {
    width: '100%',
    maxWidth: '640px',
    zIndex: 1,
    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3), 0 10px 10px -5px rgba(0,0,0,0.3)',
  },
  logoHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '1.5rem',
  },
  logoIconContainer: {
    width: '56px',
    height: '56px',
    borderRadius: '14px',
    background: 'rgba(79, 70, 229, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '0.5rem',
    border: '1px solid rgba(79, 70, 229, 0.2)',
  },
  appName: {
    fontSize: '1.6rem',
    fontWeight: '800',
    background: 'linear-gradient(135deg, #2dd4bf 0%, #818cf8 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: '0.15rem',
  },
  tagline: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  },
  title: {
    fontSize: '1.35rem',
    fontWeight: '700',
    marginBottom: '0.2rem',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
    marginBottom: '1.5rem',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: '0.8rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--primary)',
    fontWeight: '800',
    margin: '1.5rem 0 0.75rem 0',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '0.25rem',
  },
  errorAlert: {
    padding: '0.75rem 1rem',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '8px',
    color: '#f87171',
    fontSize: '0.85rem',
    marginBottom: '1.5rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: '1rem',
    color: 'var(--text-muted)',
  },
  inputWithIcon: {
    paddingLeft: '2.75rem',
  },
  divider: {
    height: '1px',
    backgroundColor: 'var(--border-color)',
    margin: '1.5rem 0',
  },
  footerText: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
  loginLink: {
    color: 'var(--primary)',
    textDecoration: 'none',
    fontWeight: '600',
  },
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={32} className="animate-spin" color="var(--primary)" /></div>}>
      <RegisterPageContent />
    </Suspense>
  )
}
