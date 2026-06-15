'use client'

import React, { useState } from 'react'
import { provisionTenant, setClinicPlan, setClinicLimits, resendOwnerInvite, provisionTenantWithTeam, type TeamMemberInput, type ClinicLimitsInput } from './actions'
import { useRouter } from 'next/navigation'
import { UserPlus, Loader2, Send, CheckCircle, AlertCircle, Users, Plus, Trash2, SlidersHorizontal } from 'lucide-react'

interface Plan { code: string; name: string }
interface LimitSet {
  maxDoctors: number | null
  maxAssistants: number | null
  maxLocations: number | null
  maxStorageMb: number | null
}
export interface TenantLimits {
  plan: LimitSet
  override: LimitSet
}
interface Tenant {
  clinic_id: string
  clinic_name: string
  plan_code: string
  doctors: number
  assistants: number
  patients: number
  storage_bytes: number
  created_at: string
}
interface Summary {
  total_orgs: number
  total_medicos: number
  total_asistentes: number
  total_pacientes: number
  almacenamiento_bytes: number
}

export default function SuperAdminClient({
  summary, tenants, plans, tenantLimits,
}: { summary: Summary | null; tenants: Tenant[]; plans: Plan[]; tenantLimits: Record<string, TenantLimits> }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  // — Editor de límites por tenant —
  const [limitsOpen, setLimitsOpen] = useState<string | null>(null)
  const [limitsDraft, setLimitsDraft] = useState<Record<keyof LimitSet, string>>({
    maxDoctors: '', maxAssistants: '', maxLocations: '', maxStorageMb: '',
  })

  function openLimits(clinicId: string) {
    if (limitsOpen === clinicId) { setLimitsOpen(null); return }
    const ov = tenantLimits[clinicId]?.override
    setLimitsDraft({
      maxDoctors: ov?.maxDoctors != null ? String(ov.maxDoctors) : '',
      maxAssistants: ov?.maxAssistants != null ? String(ov.maxAssistants) : '',
      maxLocations: ov?.maxLocations != null ? String(ov.maxLocations) : '',
      maxStorageMb: ov?.maxStorageMb != null ? String(ov.maxStorageMb) : '',
    })
    setLimitsOpen(clinicId)
  }

  async function handleSaveLimits(clinicId: string) {
    const parse = (s: string): number | null => {
      const t = s.trim()
      if (t === '') return null
      return Number(t)
    }
    const payload: ClinicLimitsInput = {
      maxDoctors: parse(limitsDraft.maxDoctors),
      maxAssistants: parse(limitsDraft.maxAssistants),
      maxLocations: parse(limitsDraft.maxLocations),
      maxStorageMb: parse(limitsDraft.maxStorageMb),
    }
    setRowBusy(clinicId)
    setMsg(null)
    const result = await setClinicLimits(clinicId, payload)
    setRowBusy(null)
    if (result?.error) {
      setMsg({ type: 'err', text: result.error })
    } else {
      setMsg({ type: 'ok', text: 'Límites actualizados.' })
      setLimitsOpen(null)
      router.refresh()
    }
  }

  // — Aprovisionamiento con equipo completo —
  const [showTeamForm, setShowTeamForm] = useState(false)
  const [teamCreating, setTeamCreating] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMemberInput[]>([
    { firstName: '', lastName: '', email: '', password: '', role: 'DOCTOR', specialty: '', professionalId: '', isOrgAdmin: true },
  ])

  function addMember() {
    setTeamMembers(prev => [...prev, { firstName: '', lastName: '', email: '', password: '', role: 'DOCTOR', specialty: '', professionalId: '', isOrgAdmin: false }])
  }

  function removeMember(i: number) {
    setTeamMembers(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateMember(i: number, field: keyof TeamMemberInput, value: string | boolean) {
    setTeamMembers(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m))
  }

  async function handleTeamCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMsg(null)
    setTeamCreating(true)
    const form = e.currentTarget
    const fd = new FormData(form)
    fd.set('teamMembers', JSON.stringify(teamMembers))
    const result = await provisionTenantWithTeam(fd)
    setTeamCreating(false)
    if (result?.error) {
      setMsg({ type: 'err', text: result.error })
    } else {
      setMsg({ type: 'ok', text: result?.warning || 'Equipo creado. Se enviaron los correos con credenciales.' })
      form.reset()
      setTeamMembers([{ firstName: '', lastName: '', email: '', password: '', role: 'DOCTOR', specialty: '', professionalId: '', isOrgAdmin: true }])
      setShowTeamForm(false)
      router.refresh()
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMsg(null)
    setCreating(true)
    const form = e.currentTarget
    const result = await provisionTenant(new FormData(form))
    setCreating(false)
    if (result?.error) {
      setMsg({ type: 'err', text: result.error })
    } else {
      setMsg({ type: 'ok', text: result?.warning || 'Cliente creado. Se envió el enlace de activación al dueño.' })
      form.reset()
      router.refresh()
    }
  }

  async function handlePlanChange(clinicId: string, planCode: string) {
    setRowBusy(clinicId)
    setMsg(null)
    const result = await setClinicPlan(clinicId, planCode)
    setRowBusy(null)
    if (result?.error) setMsg({ type: 'err', text: result.error })
    else { setMsg({ type: 'ok', text: 'Licencia actualizada.' }); router.refresh() }
  }

  async function handleResend(clinicId: string) {
    setRowBusy(clinicId)
    setMsg(null)
    const result = await resendOwnerInvite(clinicId)
    setRowBusy(null)
    setMsg(result?.error
      ? { type: 'err', text: result.error }
      : { type: 'ok', text: 'Enlace de activación reenviado.' })
  }

  return (
    <div>
      {msg && (
        <div style={{
          ...S.alert,
          background: msg.type === 'ok' ? '#ecfdf5' : '#fef2f2',
          color: msg.type === 'ok' ? '#065f46' : '#991b1b',
          border: `1px solid ${msg.type === 'ok' ? '#a7f3d0' : '#fecaca'}`,
        }}>
          {msg.type === 'ok' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {msg.text}
        </div>
      )}

      {summary && (
        <div style={S.metricsGrid}>
          <Metric title="Organizaciones" value={summary.total_orgs} />
          <Metric title="Médicos" value={summary.total_medicos} />
          <Metric title="Asistentes" value={summary.total_asistentes} />
          <Metric title="Pacientes" value={summary.total_pacientes} />
          <Metric title="Almacenamiento (MB)" value={Math.round((summary.almacenamiento_bytes || 0) / (1024 * 1024))} />
        </div>
      )}

      {/* Crear nuevo cliente */}
      <div style={S.card}>
        <div style={S.cardHeader}><UserPlus size={20} color="#0d9488" /><h2 style={S.cardTitle}>Crear nuevo cliente</h2></div>
        <form onSubmit={handleCreate}>
          <div style={S.formGrid}>
            <Field label="Nombre de la organización *"><input name="clinicName" required style={S.input} placeholder="Clínica del Valle" /></Field>
            <Field label="Plan / Licencia *">
              <select name="planCode" required style={S.input} defaultValue="">
                <option value="" disabled>Selecciona un plan</option>
                {plans.map(p => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
              </select>
            </Field>
            <Field label="Nombre(s) del dueño *"><input name="ownerFirstName" required style={S.input} placeholder="Carlos" /></Field>
            <Field label="Apellido(s) del dueño *"><input name="ownerLastName" required style={S.input} placeholder="Rivera" /></Field>
            <Field label="Correo del dueño *"><input name="ownerEmail" type="email" required style={S.input} placeholder="doctor@clinica.com" /></Field>
            <Field label="Especialidad"><input name="specialty" style={S.input} placeholder="Medicina General" /></Field>
            <Field label="N° Colegiación (CMH)"><input name="professionalId" style={S.input} placeholder="CMH-0000" /></Field>
          </div>
          <button type="submit" disabled={creating} style={S.primaryBtn}>
            {creating ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Creando...</> : <><UserPlus size={16} /> Crear cliente y enviar acceso</>}
          </button>
        </form>
      </div>

      {/* Provisionar equipo completo con credenciales */}
      <div style={S.card}>
        <div style={{ ...S.cardHeader, justifyContent: 'space-between' }}>
          <div style={S.cardHeader}>
            <Users size={20} color="#0d9488" />
            <h2 style={S.cardTitle}>Provisionar equipo completo (con credenciales)</h2>
          </div>
          <button type="button" onClick={() => setShowTeamForm(v => !v)} style={S.toggleBtn}>
            {showTeamForm ? 'Ocultar' : 'Expandir'}
          </button>
        </div>

        {showTeamForm && (
          <form onSubmit={handleTeamCreate}>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 1.25rem' }}>
              Crea la organización y todos sus usuarios con contraseñas ya fijadas. Cada miembro recibirá un correo con sus credenciales.
            </p>

            {/* Datos de la clínica */}
            <div style={{ ...S.sectionLabel }}>Organización</div>
            <div style={{ ...S.formGrid, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '1.5rem' }}>
              <Field label="Nombre *"><input name="clinicName" required style={S.input} placeholder="Centro Médico del Valle" /></Field>
              <Field label="Plan / Licencia *">
                <select name="planCode" required style={S.input} defaultValue="">
                  <option value="" disabled>Selecciona un plan</option>
                  {plans.map(p => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
                </select>
              </Field>
              <Field label="Teléfono"><input name="clinicPhone" style={S.input} placeholder="+504 9999-0000" /></Field>
              <Field label="Dirección" ><input name="clinicAddress" style={S.input} placeholder="Dirección completa" /></Field>
            </div>

            {/* Miembros del equipo */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={S.sectionLabel}>Equipo</div>
              <button type="button" onClick={addMember} style={S.addMemberBtn}>
                <Plus size={14} /> Agregar miembro
              </button>
            </div>

            {teamMembers.map((m, i) => (
              <div key={i} style={S.memberRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={S.memberIndex}>{i + 1}</span>
                  {teamMembers.length > 1 && (
                    <button type="button" onClick={() => removeMember(i)} style={S.removeBtn} title="Quitar miembro">
                      <Trash2 size={13} />
                    </button>
                  )}
                  <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto' }}>
                    <input
                      type="checkbox"
                      checked={m.isOrgAdmin}
                      onChange={e => updateMember(i, 'isOrgAdmin', e.target.checked)}
                    />
                    Admin de organización
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                  <Field label="Nombre(s) *">
                    <input value={m.firstName} onChange={e => updateMember(i, 'firstName', e.target.value)} required style={S.input} placeholder="Carlos" />
                  </Field>
                  <Field label="Apellido(s) *">
                    <input value={m.lastName} onChange={e => updateMember(i, 'lastName', e.target.value)} required style={S.input} placeholder="Rivera" />
                  </Field>
                  <Field label="Correo *">
                    <input type="email" value={m.email} onChange={e => updateMember(i, 'email', e.target.value)} required style={S.input} placeholder="doctor@clinica.com" />
                  </Field>
                  <Field label="Contraseña *">
                    <input value={m.password} onChange={e => updateMember(i, 'password', e.target.value)} required style={S.input} placeholder="clave2026" />
                  </Field>
                  <Field label="Rol *">
                    <select value={m.role} onChange={e => updateMember(i, 'role', e.target.value)} required style={S.input}>
                      <option value="DOCTOR">Médico</option>
                      <option value="ASSISTANT">Asistente</option>
                    </select>
                  </Field>
                  <Field label="Especialidad">
                    <input value={m.specialty} onChange={e => updateMember(i, 'specialty', e.target.value)} style={S.input} placeholder="Medicina General" />
                  </Field>
                  <Field label="N° Colegiación">
                    <input value={m.professionalId} onChange={e => updateMember(i, 'professionalId', e.target.value)} style={S.input} placeholder="CMH-0000" />
                  </Field>
                </div>
              </div>
            ))}

            <button type="submit" disabled={teamCreating} style={{ ...S.primaryBtn, marginTop: '1.25rem' }}>
              {teamCreating
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Creando equipo...</>
                : <><Users size={16} /> Crear organización y enviar credenciales</>}
            </button>
          </form>
        )}
      </div>

      {/* Tenants */}
      <h2 style={{ fontSize: '1.5rem', margin: '2rem 0 1rem', color: '#0f172a' }}>Clientes (Tenants)</h2>
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr style={S.theadRow}>
              <th style={S.th}>Organización</th>
              <th style={S.th}>Licencia</th>
              <th style={S.th}>Médicos</th>
              <th style={S.th}>Asistentes</th>
              <th style={S.th}>Pacientes</th>
              <th style={S.th}>Storage (MB)</th>
              <th style={S.th}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map(t => {
              const plan = tenantLimits[t.clinic_id]?.plan
              const isOpen = limitsOpen === t.clinic_id
              return (
              <React.Fragment key={t.clinic_id}>
              <tr style={{ borderBottom: isOpen ? 'none' : '1px solid #f1f5f9' }}>
                <td style={{ ...S.td, fontWeight: 600 }}>{t.clinic_name}</td>
                <td style={S.td}>
                  <select
                    value={t.plan_code}
                    disabled={rowBusy === t.clinic_id}
                    onChange={(e) => handlePlanChange(t.clinic_id, e.target.value)}
                    style={S.planSelect}
                  >
                    {plans.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}
                  </select>
                </td>
                <td style={S.td}>{t.doctors}</td>
                <td style={S.td}>{t.assistants}</td>
                <td style={S.td}>{t.patients}</td>
                <td style={S.td}>{Math.round((t.storage_bytes || 0) / (1024 * 1024))}</td>
                <td style={S.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => openLimits(t.clinic_id)}
                      disabled={rowBusy === t.clinic_id}
                      style={{ ...S.linkBtn, ...(isOpen ? { background: '#0d9488', color: '#fff', borderColor: '#0d9488' } : {}) }}
                      title="Editar topes de médicos, asistentes, clínicas y almacenamiento"
                    >
                      <SlidersHorizontal size={14} />
                      Límites
                    </button>
                    <button
                      onClick={() => handleResend(t.clinic_id)}
                      disabled={rowBusy === t.clinic_id}
                      style={S.linkBtn}
                      title="Reenviar enlace de activación al dueño"
                    >
                      {rowBusy === t.clinic_id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                      Reenviar acceso
                    </button>
                  </div>
                </td>
              </tr>
              {isOpen && (
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td colSpan={7} style={{ ...S.td, background: '#f8fafc' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '0.6rem' }}>
                      Límites del tenant <span style={{ fontWeight: 400, color: '#94a3b8' }}>· vacío = heredar el plan</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', maxWidth: '720px' }}>
                      <LimitField label="Máx. médicos" value={limitsDraft.maxDoctors} planValue={plan?.maxDoctors}
                        onChange={(v) => setLimitsDraft(d => ({ ...d, maxDoctors: v }))} />
                      <LimitField label="Máx. asistentes" value={limitsDraft.maxAssistants} planValue={plan?.maxAssistants}
                        onChange={(v) => setLimitsDraft(d => ({ ...d, maxAssistants: v }))} />
                      <LimitField label="Máx. clínicas" value={limitsDraft.maxLocations} planValue={plan?.maxLocations}
                        onChange={(v) => setLimitsDraft(d => ({ ...d, maxLocations: v }))} />
                      <LimitField label="Máx. almacenamiento (MB)" value={limitsDraft.maxStorageMb} planValue={plan?.maxStorageMb}
                        onChange={(v) => setLimitsDraft(d => ({ ...d, maxStorageMb: v }))} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem' }}>
                      <button onClick={() => handleSaveLimits(t.clinic_id)} disabled={rowBusy === t.clinic_id} style={S.primaryBtn}>
                        {rowBusy === t.clinic_id ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Guardando...</> : 'Guardar límites'}
                      </button>
                      <button onClick={() => setLimitsOpen(null)} style={S.toggleBtn}>Cancelar</button>
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
              )
            })}
            {tenants.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No hay clientes registrados aún.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <style jsx global>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function Metric({ title, value }: { title: string; value: number | string }) {
  return (
    <div style={S.metricCard}>
      <h3 style={S.metricTitle}>{title}</h3>
      <div style={S.metricValue}>{value}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  )
}

function LimitField({
  label, value, planValue, onChange,
}: { label: string; value: string; planValue?: number | null; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={S.label}>{label}</label>
      <input
        type="number"
        min={1}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={planValue != null ? `plan: ${planValue}` : 'plan: —'}
        style={S.input}
      />
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  alert: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' },
  metricCard: { background: '#fff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
  metricTitle: { margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#64748b', fontWeight: 500 },
  metricValue: { fontSize: '1.9rem', fontWeight: 700, color: '#0f172a' },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.5rem', marginBottom: '1rem' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' },
  cardTitle: { margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' },
  label: { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' },
  input: { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', background: '#fff', color: '#0f172a' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1.25rem', background: '#0d9488', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' },
  tableWrap: { overflowX: 'auto', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  theadRow: { borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' },
  th: { padding: '0.75rem 1rem', whiteSpace: 'nowrap' },
  td: { padding: '0.75rem 1rem', color: '#334155' },
  planSelect: { padding: '0.35rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, background: '#f8fafc', color: '#0f172a', cursor: 'pointer' },
  linkBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.7rem', background: 'transparent', color: '#0d9488', border: '1px solid #99f6e4', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' },
  toggleBtn: { padding: '0.4rem 0.9rem', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, color: '#475569', cursor: 'pointer' },
  sectionLabel: { fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.75rem' },
  memberRow: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', marginBottom: '0.75rem' },
  memberIndex: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: '#0d9488', color: '#fff', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 },
  addMemberBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem', background: 'transparent', border: '1px solid #99f6e4', color: '#0d9488', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' },
  removeBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.3rem', background: 'transparent', border: '1px solid #fecaca', color: '#ef4444', borderRadius: '5px', cursor: 'pointer' },
}
