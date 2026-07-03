'use client'

import React, { useState } from 'react'
import {
  seedDefaultStudyCatalog,
  createStudySection,
  updateStudySection,
  deleteStudySection,
  createStudyItem,
  updateStudyItem,
  toggleStudyItem,
  deleteStudyItem,
  setStudySectionItemsActive,
} from './actions'
import { Stethoscope, Plus, Loader2, Check, X, Edit, Trash2, Power } from 'lucide-react'

/** Fila de study_sections / study_catalog tal como llegan de la página (select *). */
interface StudySection {
  id: string
  name: string
}
interface StudyItem {
  id: string
  section_id: string
  name: string
  description?: string | null
  patient_indication?: string | null
  is_active: boolean
}

/** Resultado estándar de las server actions del catálogo. */
type ActionResult = { error?: string } | null | undefined | void

/**
 * Tarjeta de mantenimiento del Catálogo de Estudios (solo org-admin).
 * Espejo de LabCatalogCard, pero cada estudio incluye descripción e indicaciones para el paciente.
 */
export default function StudyCatalogCard({ studySections, studyItems }: { studySections: StudySection[]; studyItems: StudyItem[] }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newSectionName, setNewSectionName] = useState('')
  const [showNewSection, setShowNewSection] = useState(false)
  const [editingSecId, setEditingSecId] = useState<string | null>(null)
  const [editingSecName, setEditingSecName] = useState('')

  // Edición / alta de un estudio (name + description + indication).
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [addingSectionId, setAddingSectionId] = useState<string | null>(null)
  const [fName, setFName] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fInd, setFInd] = useState('')

  async function run(fn: () => Promise<ActionResult>) {
    setError(null)
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (res?.error) setError(res.error)
    return res
  }

  const itemsBySection = (secId: string) => studyItems.filter((t) => t.section_id === secId)

  function startEditItem(item: StudyItem) {
    setAddingSectionId(null)
    setEditingItemId(item.id)
    setFName(item.name || '')
    setFDesc(item.description || '')
    setFInd(item.patient_indication || '')
  }
  function startAddItem(secId: string) {
    setEditingItemId(null)
    setAddingSectionId(secId)
    setFName(''); setFDesc(''); setFInd('')
  }
  function cancelItemForm() {
    setEditingItemId(null); setAddingSectionId(null)
    setFName(''); setFDesc(''); setFInd('')
  }

  // Formulario reutilizable para alta/edición de un estudio.
  const itemForm = (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem', background: '#f8fafc', marginTop: '0.5rem' }}>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Nombre del estudio</label>
        <input className="form-input" value={fName} onChange={e => setFName(e.target.value)} style={{ padding: '0.35rem 0.55rem', fontSize: '0.85rem' }} placeholder="Ej. Ultrasonido de abdomen" />
      </div>
      <div className="form-group" style={{ margin: '0.6rem 0 0' }}>
        <label className="form-label">Descripción (opcional)</label>
        <input className="form-input" value={fDesc} onChange={e => setFDesc(e.target.value)} style={{ padding: '0.35rem 0.55rem', fontSize: '0.85rem' }} placeholder="Breve descripción del estudio" />
      </div>
      <div className="form-group" style={{ margin: '0.6rem 0 0' }}>
        <label className="form-label">Indicaciones para el paciente (opcional)</label>
        <textarea className="form-input" value={fInd} onChange={e => setFInd(e.target.value)} rows={4} style={{ padding: '0.35rem 0.55rem', fontSize: '0.85rem', resize: 'vertical' }} placeholder="Preparación: ayuno, suspender medicamentos, acompañante…" />
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem' }}>
        <button
          className="btn btn-primary"
          style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
          disabled={busy || !fName.trim()}
          onClick={async () => {
            const r = editingItemId
              ? await run(() => updateStudyItem(editingItemId, fName, fDesc, fInd))
              : await run(() => createStudyItem(addingSectionId!, fName, fDesc, fInd))
            if (!r?.error) cancelItemForm()
          }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar
        </button>
        <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }} onClick={cancelItemForm}>Cancelar</button>
      </div>
    </div>
  )

  return (
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Stethoscope size={20} color="var(--primary)" />
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Catálogo de Estudios</h3>
          </div>
          {studySections.length > 0 && (
            <button className="btn btn-secondary" onClick={() => setShowNewSection(v => !v)} disabled={busy} style={{ gap: '0.35rem' }}>
              <Plus size={16} /> Agregar sección
            </button>
          )}
        </div>

        <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Estudios (radiología, cardiología, etc.) que el médico podrá marcar al generar una solicitud. Cada uno puede llevar indicaciones de preparación para el paciente.
        </p>

        {error && (
          <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        {studySections.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
            <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Aún no hay catálogo de estudios. Carga la lista estándar (Cardiología + Radiología) y luego edítala a tu gusto.
            </p>
            <button className="btn btn-primary" disabled={busy} onClick={() => run(() => seedDefaultStudyCatalog())} style={{ gap: '0.4rem' }}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Stethoscope size={16} />}
              Cargar catálogo estándar de estudios
            </button>
          </div>
        ) : (
          <>
            {showNewSection && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Nombre de la sección (Ej. Endoscopía)"
                  value={newSectionName}
                  onChange={e => setNewSectionName(e.target.value)}
                  style={{ flex: 1, minWidth: '200px' }}
                />
                <button className="btn btn-primary" disabled={busy || !newSectionName.trim()} onClick={async () => {
                  const res = await run(() => createStudySection(newSectionName))
                  if (!res?.error) { setNewSectionName(''); setShowNewSection(false) }
                }}>Crear</button>
                <button className="btn btn-secondary" onClick={() => { setShowNewSection(false); setNewSectionName('') }}>Cancelar</button>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
              {studySections.map((sec) => (
                <div key={sec.id} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.85rem', background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    {editingSecId === sec.id ? (
                      <div style={{ display: 'flex', gap: '0.35rem', flex: 1 }}>
                        <input type="text" className="form-input" value={editingSecName} onChange={e => setEditingSecName(e.target.value)} style={{ flex: 1, padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
                        <button title="Guardar" className="btn btn-primary" style={{ padding: '0.3rem 0.5rem' }} disabled={busy} onClick={async () => { const r = await run(() => updateStudySection(sec.id, editingSecName)); if (!r?.error) setEditingSecId(null) }}><Check size={14} /></button>
                        <button title="Cancelar" className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={() => setEditingSecId(null)}><X size={14} /></button>
                      </div>
                    ) : (
                      <>
                        <span style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-main)' }}>{sec.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                          {itemsBySection(sec.id).length > 0 && (
                            <button
                              title="Activar o desactivar todos los estudios de esta sección"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: '0.7rem', fontWeight: 700, padding: 0, whiteSpace: 'nowrap' }}
                              disabled={busy}
                              onClick={() => { const allActive = itemsBySection(sec.id).every((t) => t.is_active); run(() => setStudySectionItemsActive(sec.id, !allActive)) }}
                            >
                              {itemsBySection(sec.id).every((t) => t.is_active) ? 'Desactivar todos' : 'Activar todos'}
                            </button>
                          )}
                          <button title="Renombrar sección" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => { setEditingSecId(sec.id); setEditingSecName(sec.name) }}><Edit size={14} /></button>
                          <button title="Eliminar sección" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }} disabled={busy} onClick={() => { if (confirm(`¿Eliminar la sección "${sec.name}" y todos sus estudios?`)) run(() => deleteStudySection(sec.id)) }}><Trash2 size={14} /></button>
                        </div>
                      </>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {itemsBySection(sec.id).map((item) => (
                      <div key={item.id} style={{ opacity: item.is_active ? 1 : 0.5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                          <span style={{ flex: 1, textDecoration: item.is_active ? 'none' : 'line-through' }} title={item.patient_indication || item.description || ''}>{item.name}</span>
                          <button title="Editar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => startEditItem(item)}><Edit size={13} /></button>
                          <button title={item.is_active ? 'Desactivar' : 'Activar'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: item.is_active ? 'var(--danger)' : 'var(--primary)' }} disabled={busy} onClick={() => run(() => toggleStudyItem(item.id, !item.is_active))}><Power size={13} /></button>
                          <button title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }} disabled={busy} onClick={() => { if (confirm(`¿Eliminar el estudio "${item.name}"?`)) run(() => deleteStudyItem(item.id)) }}><Trash2 size={13} /></button>
                        </div>
                        {editingItemId === item.id && itemForm}
                      </div>
                    ))}
                    {itemsBySection(sec.id).length === 0 && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sin estudios.</span>
                    )}
                  </div>

                  {addingSectionId === sec.id ? itemForm : (
                    <div style={{ marginTop: '0.6rem' }}>
                      <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.82rem', gap: '0.3rem' }} disabled={busy} onClick={() => startAddItem(sec.id)}>
                        <Plus size={14} /> Agregar estudio
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
  )
}
