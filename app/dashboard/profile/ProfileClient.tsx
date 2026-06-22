'use client'

import React, { useState } from 'react'
import { updateOwnProfile, changeOwnPassword } from './actions'
import { User, Lock, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

type Msg = { type: 'success' | 'error'; text: string } | null

export default function ProfileClient({ profile, email }: { profile: any; email: string }) {
  const clinical = profile?.role === 'DOCTOR' || profile?.role === 'ADMIN'

  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<Msg>(null)
  const [savingPass, setSavingPass] = useState(false)
  const [passMsg, setPassMsg] = useState<Msg>(null)

  async function onSaveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setProfileMsg(null); setSavingProfile(true)
    const res = await updateOwnProfile(new FormData(e.currentTarget))
    setSavingProfile(false)
    setProfileMsg(res?.error ? { type: 'error', text: res.error } : { type: 'success', text: 'Información actualizada.' })
  }

  async function onChangePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setPassMsg(null); setSavingPass(true)
    const res = await changeOwnPassword(new FormData(form))
    setSavingPass(false)
    if (res?.error) { setPassMsg({ type: 'error', text: res.error }) }
    else { setPassMsg({ type: 'success', text: 'Contraseña actualizada.' }); form.reset() }
  }

  const MsgBox = ({ msg }: { msg: Msg }) => msg ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.85rem', borderRadius: '8px', fontSize: '0.85rem', margin: '0 0 1rem',
      background: msg.type === 'success' ? '#ecfdf5' : '#fee2e2', color: msg.type === 'success' ? '#065f46' : '#b91c1c',
      border: `1px solid ${msg.type === 'success' ? '#a7f3d0' : '#fecaca'}` }}>
      {msg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />} {msg.text}
    </div>
  ) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Mi Usuario</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Edita tu información personal y tu contraseña de acceso</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        {/* Información personal */}
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1.25rem', fontSize: '1.1rem' }}>
            <User size={18} color="#0d9488" /> Información personal
          </h3>
          <MsgBox msg={profileMsg} />
          <form onSubmit={onSaveProfile}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Nombre(s)</label>
                <input className="form-input" name="first_name" defaultValue={profile?.first_name || ''} required />
              </div>
              <div className="form-group">
                <label className="form-label">Apellido(s)</label>
                <input className="form-input" name="last_name" defaultValue={profile?.last_name || ''} required />
              </div>
              <div className="form-group">
                <label className="form-label">Género</label>
                <select className="form-input" name="gender" defaultValue={profile?.gender || ''}>
                  <option value="">Sin especificar</option>
                  <option value="M">Masculino{clinical ? ' (Dr.)' : ''}</option>
                  <option value="F">Femenino{clinical ? ' (Dra.)' : ''}</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <input className="form-input" name="phone" defaultValue={profile?.phone || ''} placeholder="Opcional" />
              </div>
            </div>

            {clinical && (
              <>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Especialidad</label>
                    <input className="form-input" name="specialty" defaultValue={profile?.specialty || ''} placeholder="Ej. Medicina General" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">N° Colegiación</label>
                    <input className="form-input" name="professional_id" defaultValue={profile?.professional_id || ''} placeholder="CMH-0000" />
                  </div>
                </div>
                <div style={{ marginTop: '0.25rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Datos para receta (opcional). Si se llenan, reemplazan los de la organización en tus recetas.
                  </p>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Nombre del consultorio</label>
                      <input className="form-input" name="practice_name" defaultValue={profile?.practice_name || ''} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Teléfono (receta)</label>
                      <input className="form-input" name="practice_phone" defaultValue={profile?.practice_phone || ''} />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label className="form-label">Dirección (receta)</label>
                      <input className="form-input" name="practice_address" defaultValue={profile?.practice_address || ''} />
                    </div>
                  </div>
                </div>
              </>
            )}

            <button type="submit" className="btn btn-primary" disabled={savingProfile} style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              {savingProfile ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
              Guardar cambios
            </button>
          </form>
        </div>

        {/* Cambiar contraseña */}
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1.25rem', fontSize: '1.1rem' }}>
            <Lock size={18} color="#0d9488" /> Cambiar contraseña
          </h3>
          <MsgBox msg={passMsg} />
          <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Correo de acceso: <strong>{email}</strong>
          </p>
          <form onSubmit={onChangePassword}>
            <div className="form-group">
              <label className="form-label">Contraseña actual</label>
              <input className="form-input" type="password" name="current_password" required autoComplete="current-password" />
            </div>
            <div className="form-group">
              <label className="form-label">Nueva contraseña</label>
              <input className="form-input" type="password" name="new_password" required minLength={8} autoComplete="new-password" placeholder="Mínimo 8 caracteres" />
            </div>
            <div className="form-group">
              <label className="form-label">Confirmar nueva contraseña</label>
              <input className="form-input" type="password" name="confirm_password" required minLength={8} autoComplete="new-password" />
            </div>
            <button type="submit" className="btn btn-primary" disabled={savingPass} style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              {savingPass ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Lock size={16} />}
              Cambiar contraseña
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
