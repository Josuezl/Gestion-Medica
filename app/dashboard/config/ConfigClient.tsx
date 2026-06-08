'use client'

import React, { useState } from 'react'
import { sendInvitation, revokeInvitation, updateClinicInfo } from './actions'
import { Users, Building2, UserPlus, Trash2, Mail, Shield, User } from 'lucide-react'

interface ConfigClientProps {
  clinic: any
  teamMembers: any[]
  invitations: any[]
  currentUserId: string
  maxUsers: number
}

export default function ConfigClient({
  clinic,
  teamMembers,
  invitations,
  currentUserId,
  maxUsers
}: ConfigClientProps) {
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const totalCount = teamMembers.length + invitations.length
  const limitReached = totalCount >= maxUsers
  const usagePercentage = Math.min((totalCount / maxUsers) * 100, 100)

  async function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    
    const formData = new FormData(e.currentTarget)
    const res = await sendInvitation(formData)
    
    setLoading(false)
    if (res?.error) {
      setError(res.error)
    } else {
      setShowInviteForm(false)
      alert('Invitación enviada con éxito')
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('¿Estás seguro de revocar esta invitación?')) return
    await revokeInvitation(id)
  }

  async function handleUpdateClinic(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    
    const formData = new FormData(e.currentTarget)
    const res = await updateClinicInfo(formData)
    
    setLoading(false)
    if (res?.error) {
      setError(res.error)
    } else {
      alert('Información actualizada')
    }
  }

  return (
    <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr' }}>
      
      {/* Sección 1: Equipo Médico */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={20} color="var(--primary)" />
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Equipo Médico</h3>
          </div>
          <button 
            className="btn btn-primary"
            onClick={() => setShowInviteForm(!showInviteForm)}
            disabled={limitReached}
          >
            <UserPlus size={16} />
            Invitar Miembro
          </button>
        </div>

        {/* Uso del Plan */}
        <div style={{ marginBottom: '2rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 600 }}>Uso de la licencia</span>
            <span>{totalCount} / {maxUsers} miembros</span>
          </div>
          <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ 
              height: '100%', 
              background: limitReached ? 'var(--danger)' : 'var(--primary)',
              width: `${usagePercentage}%`,
              transition: 'width 0.3s ease'
            }}></div>
          </div>
          {limitReached && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--danger)' }}>
              Has alcanzado el límite de usuarios para tu plan actual.
            </p>
          )}
        </div>

        {error && (
          <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        {/* Formulario de Invitación */}
        {showInviteForm && !limitReached && (
          <form onSubmit={handleInvite} style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Nueva Invitación</h4>
            <div className="grid-3" style={{ marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Correo electrónico</label>
                <input type="email" name="email" className="form-input" required placeholder="correo@ejemplo.com" />
              </div>
              <div className="form-group">
                <label className="form-label">Rol</label>
                <select name="role" className="form-input" required defaultValue="DOCTOR">
                  <option value="DOCTOR">Médico Especialista</option>
                  <option value="ASSISTANT">Asistente/Secretaria</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Especialidad (opcional)</label>
                <input type="text" name="specialty" className="form-input" placeholder="Ej. Pediatría" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar Invitación'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowInviteForm(false)}>
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* Tabla de Miembros */}
        <h4 style={{ margin: '0 0 1rem', fontSize: '1rem', color: 'var(--text-muted)' }}>Miembros Activos</h4>
        <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Nombre</th>
                <th style={{ padding: '0.75rem 1rem' }}>Rol</th>
                <th style={{ padding: '0.75rem 1rem' }}>Especialidad</th>
                <th style={{ padding: '0.75rem 1rem' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.map((member) => (
                <tr key={member.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>
                        {member.first_name[0]}{member.last_name[0]}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{member.first_name} {member.last_name} {member.id === currentUserId ? '(Tú)' : ''}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{member.email || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className={`badge ${member.role === 'ADMIN' ? 'badge-info' : member.role === 'DOCTOR' ? 'badge-success' : 'badge-warning'}`}>
                      {member.role === 'ADMIN' && <Shield size={12} style={{ marginRight: '4px' }} />}
                      {member.role === 'DOCTOR' && <User size={12} style={{ marginRight: '4px' }} />}
                      {member.role}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>
                    {member.specialty || '—'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className="badge badge-success">Activo</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Invitaciones Pendientes */}
        {invitations.length > 0 && (
          <>
            <h4 style={{ margin: '0 0 1rem', fontSize: '1rem', color: 'var(--text-muted)' }}>Invitaciones Pendientes</h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Correo</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Rol</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Enviado por</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Expiración</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Mail size={14} color="var(--text-muted)" />
                          {inv.email}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>{inv.role}</td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>
                        {inv.invited_by_user?.first_name} {inv.invited_by_user?.last_name}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>
                        {new Date(inv.expires_at).toLocaleDateString('es-HN')}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <button 
                          onClick={() => handleRevoke(inv.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 600 }}
                        >
                          <Trash2 size={14} />
                          Revocar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Sección 2: Información de la Clínica */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <Building2 size={20} color="var(--primary)" />
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Información de la Clínica</h3>
        </div>

        <form onSubmit={handleUpdateClinic}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Nombre de la Clínica</label>
              <input type="text" name="name" className="form-input" defaultValue={clinic.name} required />
            </div>
            <div className="form-group">
              <label className="form-label">Teléfono</label>
              <input type="text" name="phone" className="form-input" defaultValue={clinic.phone || ''} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Dirección Completa</label>
            <textarea name="address" className="form-input" rows={3} defaultValue={clinic.address || ''} style={{ resize: 'vertical' }}></textarea>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>

    </div>
  )
}
