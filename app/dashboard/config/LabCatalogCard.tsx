'use client'

import React, { useState } from 'react'
import {
  seedDefaultLabCatalog,
  createLabCategory,
  updateLabCategory,
  deleteLabCategory,
  createLabTest,
  updateLabTest,
  toggleLabTest,
  deleteLabTest,
  setLabCategoryTestsActive,
} from './actions'
import { FlaskConical, Plus, Loader2, Check, X, Edit, Trash2, Power } from 'lucide-react'

/**
 * Tarjeta de mantenimiento del Catálogo de Laboratorio (solo org-admin).
 * Estado y handlers locales — extraído de ConfigClient sin alterar la lógica.
 */
export default function LabCatalogCard({ labCategories, labTests }: { labCategories: any[]; labTests: any[] }) {
  const [labBusy, setLabBusy] = useState(false)
  const [labError, setLabError] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newTestByCat, setNewTestByCat] = useState<Record<string, string>>({})
  const [editingTestId, setEditingTestId] = useState<string | null>(null)
  const [editingTestName, setEditingTestName] = useState('')
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatName, setEditingCatName] = useState('')

  async function runLab(fn: () => Promise<any>) {
    setLabError(null)
    setLabBusy(true)
    const res = await fn()
    setLabBusy(false)
    if (res?.error) setLabError(res.error)
    return res
  }

  const labTestsByCategory = (catId: string) =>
    labTests.filter((t: any) => t.category_id === catId)

  return (
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FlaskConical size={20} color="var(--primary)" />
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Catálogo de Laboratorio</h3>
          </div>
          {labCategories.length > 0 && (
            <button className="btn btn-secondary" onClick={() => setShowNewCategory(v => !v)} disabled={labBusy} style={{ gap: '0.35rem' }}>
              <Plus size={16} /> Agregar categoría
            </button>
          )}
        </div>

        <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Estos son los exámenes que el médico podrá marcar al generar una orden de laboratorio.
        </p>

        {labError && (
          <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {labError}
          </div>
        )}

        {labCategories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
            <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Aún no hay catálogo. Carga la lista estándar y luego edítala a tu gusto.
            </p>
            <button className="btn btn-primary" disabled={labBusy} onClick={() => runLab(() => seedDefaultLabCatalog())} style={{ gap: '0.4rem' }}>
              {labBusy ? <Loader2 size={16} className="animate-spin" /> : <FlaskConical size={16} />}
              Cargar catálogo estándar
            </button>
          </div>
        ) : (
          <>
            {showNewCategory && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Nombre de la categoría (Ej. INMUNOLOGÍA)"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  style={{ flex: 1, minWidth: '200px' }}
                />
                <button className="btn btn-primary" disabled={labBusy || !newCategoryName.trim()} onClick={async () => {
                  const res = await runLab(() => createLabCategory(newCategoryName))
                  if (!res?.error) { setNewCategoryName(''); setShowNewCategory(false) }
                }}>Crear</button>
                <button className="btn btn-secondary" onClick={() => { setShowNewCategory(false); setNewCategoryName('') }}>Cancelar</button>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {labCategories.map((cat: any) => (
                <div key={cat.id} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.85rem', background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    {editingCatId === cat.id ? (
                      <div style={{ display: 'flex', gap: '0.35rem', flex: 1 }}>
                        <input type="text" className="form-input" value={editingCatName} onChange={e => setEditingCatName(e.target.value)} style={{ flex: 1, padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
                        <button title="Guardar" className="btn btn-primary" style={{ padding: '0.3rem 0.5rem' }} disabled={labBusy} onClick={async () => { const r = await runLab(() => updateLabCategory(cat.id, editingCatName)); if (!r?.error) setEditingCatId(null) }}><Check size={14} /></button>
                        <button title="Cancelar" className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={() => setEditingCatId(null)}><X size={14} /></button>
                      </div>
                    ) : (
                      <>
                        <span style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-main)' }}>{cat.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                          {labTestsByCategory(cat.id).length > 0 && (
                            <button
                              title="Activar o desactivar todos los exámenes de esta categoría"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: '0.7rem', fontWeight: 700, padding: 0, whiteSpace: 'nowrap' }}
                              disabled={labBusy}
                              onClick={() => { const allActive = labTestsByCategory(cat.id).every((t: any) => t.is_active); runLab(() => setLabCategoryTestsActive(cat.id, !allActive)) }}
                            >
                              {labTestsByCategory(cat.id).every((t: any) => t.is_active) ? 'Desactivar todos' : 'Activar todos'}
                            </button>
                          )}
                          <button title="Renombrar categoría" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name) }}><Edit size={14} /></button>
                          <button title="Eliminar categoría" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }} disabled={labBusy} onClick={() => { if (confirm(`¿Eliminar la categoría "${cat.name}" y todos sus exámenes?`)) runLab(() => deleteLabCategory(cat.id)) }}><Trash2 size={14} /></button>
                        </div>
                      </>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {labTestsByCategory(cat.id).map((test: any) => (
                      <div key={test.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', opacity: test.is_active ? 1 : 0.5 }}>
                        {editingTestId === test.id ? (
                          <>
                            <input type="text" className="form-input" value={editingTestName} onChange={e => setEditingTestName(e.target.value)} style={{ flex: 1, padding: '0.25rem 0.45rem', fontSize: '0.82rem' }} />
                            <button title="Guardar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)' }} disabled={labBusy} onClick={async () => { const r = await runLab(() => updateLabTest(test.id, editingTestName)); if (!r?.error) setEditingTestId(null) }}><Check size={14} /></button>
                            <button title="Cancelar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => setEditingTestId(null)}><X size={14} /></button>
                          </>
                        ) : (
                          <>
                            <span style={{ flex: 1, textDecoration: test.is_active ? 'none' : 'line-through' }}>{test.name}</span>
                            <button title="Renombrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => { setEditingTestId(test.id); setEditingTestName(test.name) }}><Edit size={13} /></button>
                            <button title={test.is_active ? 'Desactivar' : 'Activar'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: test.is_active ? 'var(--danger)' : 'var(--primary)' }} disabled={labBusy} onClick={() => runLab(() => toggleLabTest(test.id, !test.is_active))}><Power size={13} /></button>
                            <button title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }} disabled={labBusy} onClick={() => { if (confirm(`¿Eliminar el examen "${test.name}"?`)) runLab(() => deleteLabTest(test.id)) }}><Trash2 size={13} /></button>
                          </>
                        )}
                      </div>
                    ))}
                    {labTestsByCategory(cat.id).length === 0 && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sin exámenes.</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.6rem' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Agregar examen…"
                      value={newTestByCat[cat.id] || ''}
                      onChange={e => setNewTestByCat({ ...newTestByCat, [cat.id]: e.target.value })}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && (newTestByCat[cat.id] || '').trim()) {
                          const r = await runLab(() => createLabTest(cat.id, newTestByCat[cat.id]))
                          if (!r?.error) setNewTestByCat({ ...newTestByCat, [cat.id]: '' })
                        }
                      }}
                      style={{ flex: 1, padding: '0.3rem 0.5rem', fontSize: '0.82rem' }}
                    />
                    <button className="btn btn-secondary" style={{ padding: '0.3rem 0.55rem' }} disabled={labBusy || !(newTestByCat[cat.id] || '').trim()} onClick={async () => {
                      const r = await runLab(() => createLabTest(cat.id, newTestByCat[cat.id] || ''))
                      if (!r?.error) setNewTestByCat({ ...newTestByCat, [cat.id]: '' })
                    }}><Plus size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
  )
}
