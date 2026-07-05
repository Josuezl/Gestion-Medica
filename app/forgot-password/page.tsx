'use client'

import React, { useState } from 'react'
import { requestPasswordReset } from './actions'
import { Stethoscope, Mail, Loader2, ArrowRight, CheckCircle } from 'lucide-react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    const result = await requestPasswordReset(new FormData(event.currentTarget))
    setLoading(false)
    if (result?.error) setError(result.error)
    else setSent(true)
  }

  return (
    <div style={styles.container}>
      <div style={styles.bubble1}></div>
      <div style={styles.bubble2}></div>

      <div className="card-glass" style={styles.card}>
        <div style={styles.logoHeader}>
          <div style={styles.logoIconContainer}>
            <Stethoscope size={32} color="var(--primary)" />
          </div>
          <h1 style={styles.appName}>CloudMedHN</h1>
          <p style={styles.tagline}>Recuperación de acceso</p>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle size={48} color="#0d9488" style={{ margin: '0 auto 1rem' }} />
            <h2 style={styles.title}>Revisa tu correo</h2>
            <p style={styles.subtitle}>
              Si ese correo está registrado, te enviamos un enlace para restablecer tu contraseña.
              Revisa también tu carpeta de spam.
            </p>
            <Link href="/login" style={styles.loginLink}>Volver a iniciar sesión</Link>
          </div>
        ) : (
          <>
            <h2 style={styles.title}>¿Olvidaste tu contraseña?</h2>
            <p style={styles.subtitle}>
              Ingresa tu correo y te enviaremos un enlace para crear una nueva.
            </p>

            {error && <div style={styles.errorAlert}>{error}</div>}

            <form onSubmit={handleSubmit} style={styles.form}>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" htmlFor="email">Correo Electrónico</label>
                <div style={styles.inputWrapper}>
                  <Mail size={18} style={styles.inputIcon} />
                  <input
                    className="form-input"
                    id="email"
                    name="email"
                    type="email"
                    placeholder="ejemplo@doctor.com"
                    required
                    style={styles.inputWithIcon}
                  />
                </div>
              </div>

              <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', gap: '0.75rem' }}>
                {loading ? (
                  <><Loader2 size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> Enviando...</>
                ) : (
                  <>Enviar enlace <ArrowRight size={18} /></>
                )}
              </button>
            </form>

            <div style={styles.divider}></div>
            <p style={styles.footerText}>
              <Link href="/login" style={styles.loginLink}>Volver a iniciar sesión</Link>
            </p>
          </>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'radial-gradient(circle at 10% 20%, rgba(13, 148, 136, 0.08) 0%, rgba(9, 13, 22, 1) 90%)',
    position: 'relative', overflow: 'hidden', padding: '1.5rem',
  },
  bubble1: { position: 'absolute', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(13,148,136,0.15) 0%, rgba(13,148,136,0) 70%)', top: '-50px', left: '-50px', zIndex: 0 },
  bubble2: { position: 'absolute', width: '450px', height: '450px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,70,229,0.1) 0%, rgba(79,70,229,0) 70%)', bottom: '-100px', right: '-100px', zIndex: 0 },
  card: { width: '100%', maxWidth: '460px', zIndex: 1, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3), 0 10px 10px -5px rgba(0,0,0,0.3)' },
  logoHeader: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2rem' },
  logoIconContainer: { width: '56px', height: '56px', borderRadius: '14px', background: 'rgba(79, 70, 229, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem', border: '1px solid rgba(79, 70, 229, 0.2)' },
  appName: { fontSize: '1.75rem', fontWeight: '800', letterSpacing: '-0.025em', background: 'linear-gradient(135deg, #2dd4bf 0%, #818cf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.25rem' },
  tagline: { fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' },
  title: { fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.25rem', textAlign: 'center' },
  subtitle: { fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem', textAlign: 'center', lineHeight: '1.5' },
  errorAlert: { padding: '0.75rem 1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#f87171', fontSize: '0.85rem', marginBottom: '1.5rem' },
  form: { display: 'flex', flexDirection: 'column' },
  inputWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  inputIcon: { position: 'absolute', left: '1rem', color: 'var(--text-muted)' },
  inputWithIcon: { paddingLeft: '2.75rem' },
  divider: { height: '1px', backgroundColor: 'var(--border-color)', margin: '1.75rem 0' },
  footerText: { fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center' },
  loginLink: { color: 'var(--primary)', textDecoration: 'none', fontWeight: '600' },
}
