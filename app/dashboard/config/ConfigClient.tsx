'use client'

import React, { useState } from 'react'
import { sendInvitation, revokeInvitation, updateClinicInfo, createLocation, toggleLocationStatus, updateLocation } from './actions'
import { Users, Building2, UserPlus, Trash2, Mail, Shield, User, MapPin, Plus, Power, ArrowUpCircle, Edit, HardDrive } from 'lucide-react'

interface ConfigClientProps {
  clinic: any
  teamMembers: any[]
  invitations: any[]
  locations: any[]
  currentUserId: string
  maxDoctors: number
  maxAssistants: number
  planCode: string
  maxLocations: number
  storageUsedBytes: number
  maxStorageMb: number
}

export default function ConfigClient({
  clinic,
  teamMembers,
  invitations,
  locations,
  currentUserId,
  maxDoctors,
  maxAssistants,
  planCode,
  maxLocations,
  storageUsedBytes,
  maxStorageMb
}: ConfigClientProps) {
  const usedMb = storageUsedBytes / (1024 * 1024)
  const usedGb = usedMb / 1024
  const maxGb = maxStorageMb / 1024
  const storagePct = Math.min((usedMb / maxStorageMb) * 100, 100)
  const storageNearLimit = storagePct >= 80
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [showLocationForm, setShowLocationForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [clinicLoading, setClinicLoading] = useState(false)
  const [clinicError, setClinicError] = useState<string | null>(null)
  
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [editLocName, setEditLocName] = useState('')
  const [editLocAddress, setEditLocAddress] = useState('')
  
  const allMembersAndInvites = [...teamMembers, ...invitations]
  
  const doctorCount = allMembersAndInvites.filter(m => m.role === 'DOCTOR' || m.role === 'ADMIN').length
  const assistantCount = allMembersAndInvites.filter(m => m.role === 'ASSISTANT').length
  
  const doctorLimitReached = doctorCount >= maxDoctors
  const assistantLimitReached = assistantCount >= maxAssistants
  
  const doctorUsagePercentage = Math.min((doctorCount / maxDoctors) * 100, 100)
  const assistantUsagePercentage = Math.min((assistantCount / maxAssistants) * 100, 100)
  
  // Disable invite button if both limits are reached (or depending on plan restrictions)
  const limitReached = planCode === 'SOLO_MEDICO' ? assistantLimitReached : (doctorLimitReached && assistantLimitReached)

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
      alert(res?.warning || 'Cuenta creada. Se envió un enlace de activación al correo del nuevo miembro.')
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('¿Estás seguro de revocar esta invitación?')) return
    await revokeInvitation(id)
  }

  async function handleUpdateClinic(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setClinicError(null)
    setClinicLoading(true)
    
    const formData = new FormData(e.currentTarget)
    try {
      const res = await updateClinicInfo(formData)
      setClinicLoading(false)
      if (res?.error) {
        setClinicError(res.error)
      } else {
        alert('Información actualizada')
      }
    } catch (err: any) {
      setClinicLoading(false)
      setClinicError('Error inesperado: ' + err.message)
    }
  }

  async function handleCreateLocation(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    
    const formData = new FormData(e.currentTarget)
    const res = await createLocation(formData)
    
    setLoading(false)
    if (res?.error) {
      setError(res.error)
    } else {
      setShowLocationForm(false)
    }
  }

  async function handleToggleLocation(id: string, currentStatus: boolean) {
    const confirmMessage = currentStatus 
      ? '¿Estás seguro de desactivar esta clínica? Nadie podrá acceder a ella.'
      : '¿Deseas reactivar esta clínica?'
    
    if (!confirm(confirmMessage)) return
    
    const res = await toggleLocationStatus(id, !currentStatus)
    if (res.error) alert(res.error)
  }

  async function handleUpdateLocation(id: string) {
    if (!editLocName.trim()) return
    const res = await updateLocation(id, editLocName, editLocAddress)
    if (res.error) alert(res.error)
    else setEditingLocationId(null)
  }

  return (
    <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr' }}>

      {/* Almacenamiento */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <HardDrive size={20} color="var(--primary)" />
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Almacenamiento</h3>
          </div>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: storageNearLimit ? '#dc2626' : 'var(--text-muted)' }}>
            {usedGb < 0.1 ? `${usedMb.toFixed(1)} MB` : `${usedGb.toFixed(2)} GB`} / {maxGb >= 1 ? `${maxGb.toFixed(0)} GB` : `${maxStorageMb} MB`}
          </span>
        </div>
        <div style={{ height: '8px', borderRadius: '4px', background: '#e2e8f0', overflow: 'hidden' }}>
          <div style={{ width: `${storagePct}%`, height: '100%', borderRadius: '4px', background: storageNearLimit ? '#dc2626' : '#0d9488', transition: 'width 0.3s' }} />
        </div>
        {storageNearLimit && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#dc2626' }}>
            Estás cerca del límite de tu plan. Contacta para ampliar tu almacenamiento.
          </p>
        )}
      </div>

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
        <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          {/* Progress Bar Doctores */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 600 }}>Médicos Especialistas</span>
              <span>{doctorCount} / {maxDoctors} miembros</span>
            </div>
            <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ 
                height: '100%', 
                background: doctorLimitReached ? 'var(--danger)' : 'var(--primary)',
                width: `${doctorUsagePercentage}%`,
                transition: 'width 0.3s ease'
              }}></div>
            </div>
            {doctorLimitReached && (
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--danger)' }}>
                Has alcanzado el límite de médicos para tu licencia actual.
              </p>
            )}
          </div>

          {/* Progress Bar Asistentes */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 600 }}>Asistentes / Secretarias</span>
              <span>{assistantCount} / {maxAssistants} miembros</span>
            </div>
            <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ 
                height: '100%', 
                background: assistantLimitReached ? 'var(--danger)' : 'var(--primary)',
                width: `${assistantUsagePercentage}%`,
                transition: 'width 0.3s ease'
              }}></div>
            </div>
            {assistantLimitReached && (
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--danger)' }}>
                Has alcanzado el límite de asistentes para tu licencia actual.
              </p>
            )}
          </div>
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
                <label className="form-label">Nombre(s)</label>
                <input type="text" name="firstName" className="form-input" required placeholder="Ej. Ana" />
              </div>
              <div className="form-group">
                <label className="form-label">Apellido(s)</label>
                <input type="text" name="lastName" className="form-input" required placeholder="Ej. López" />
              </div>
              <div className="form-group">
                <label className="form-label">Correo electrónico</label>
                <input type="email" name="email" className="form-input" required placeholder="correo@ejemplo.com" />
              </div>
              <div className="form-group">
                <label className="form-label">Rol</label>
                <select name="role" className="form-input" required defaultValue={planCode === 'HOSPITAL' ? 'DOCTOR' : 'ASSISTANT'}>
                  {planCode === 'HOSPITAL' && (
                    <option value="DOCTOR">Médico Especialista</option>
                  )}
                  <option value="ASSISTANT">Asistente/Secretaria</option>
                </select>
              </div>
              {planCode === 'HOSPITAL' && (
                <div className="form-group">
                  <label className="form-label">Especialidad (opcional)</label>
                  <input type="text" name="specialty" className="form-input" placeholder="Ej. Pediatría" />
                </div>
              )}
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

      {/* Sección 2: Información de la Organización */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <Building2 size={20} color="var(--primary)" />
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Información de la Organización</h3>
        </div>

        <form onSubmit={handleUpdateClinic}>
          {clinicError && (
            <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.9rem' }}>
              {clinicError}
            </div>
          )}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Nombre de la Organización</label>
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
            <button type="submit" className="btn btn-primary" disabled={clinicLoading}>
              {clinicLoading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>

      {/* Sección 3: Clínicas (Solo para plan SOLO_MEDICO que se mueve entre clínicas) */}
      {planCode === 'SOLO_MEDICO' && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MapPin size={20} color="var(--primary)" />
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Clínicas</h3>
            </div>
            <button 
              className="btn btn-primary"
              onClick={() => setShowLocationForm(!showLocationForm)}
              disabled={locations.length >= maxLocations}
            >
              <Plus size={16} />
              Agregar Clínica
            </button>
          </div>

          <div style={{ marginBottom: '1.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Límite de clínicas: {locations.length} / {maxLocations}
          </div>

          {showLocationForm && locations.length < maxLocations && (
            <form onSubmit={handleCreateLocation} style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Nueva Clínica</h4>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Nombre de la Clínica</label>
                  <input type="text" name="name" className="form-input" required placeholder="Ej. Centro Médico San Juan" />
                </div>
                <div className="form-group">
                  <label className="form-label">Dirección (opcional)</label>
                  <input type="text" name="address" className="form-input" placeholder="Ej. Calle Principal, Casa 4" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Guardando...' : 'Crear Clínica'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowLocationForm(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Nombre</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Dirección</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Estado</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((loc) => {
                  const isEditing = editingLocationId === loc.id;
                  
                  return (
                    <tr key={loc.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: loc.is_active ? 1 : 0.6 }}>
                      {isEditing ? (
                        <>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <input type="text" className="form-input" value={editLocName} onChange={e => setEditLocName(e.target.value)} style={{ padding: '0.4rem', fontSize: '0.85rem' }} />
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <input type="text" className="form-input" value={editLocAddress} onChange={e => setEditLocAddress(e.target.value)} style={{ padding: '0.4rem', fontSize: '0.85rem' }} />
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span className={`badge ${loc.is_active ? 'badge-success' : 'badge-danger'}`}>
                              {loc.is_active ? 'Activa' : 'Inactiva'}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button onClick={() => handleUpdateLocation(loc.id)} className="btn btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>Guardar</button>
                              <button onClick={() => setEditingLocationId(null)} className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>Cancelar</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{loc.name}</td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>{loc.address || '—'}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span className={`badge ${loc.is_active ? 'badge-success' : 'badge-danger'}`}>
                              {loc.is_active ? 'Activa' : 'Inactiva'}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                            <button 
                              onClick={() => {
                                setEditingLocationId(loc.id)
                                setEditLocName(loc.name)
                                setEditLocAddress(loc.address || '')
                              }}
                              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 600, marginRight: '1rem' }}
                            >
                              <Edit size={14} /> Editar
                            </button>
                            <button 
                              onClick={() => handleToggleLocation(loc.id, loc.is_active)}
                              style={{ background: 'none', border: 'none', color: loc.is_active ? 'var(--danger)' : 'var(--primary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 600 }}
                            >
                              <Power size={14} />
                              {loc.is_active ? 'Desactivar' : 'Activar'}
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
                {locations.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No tienes clínicas adicionales configuradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
