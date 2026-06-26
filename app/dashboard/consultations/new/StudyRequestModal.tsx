'use client'

import React, { useState } from 'react'
import { ClipboardList, X, Plus, Trash2 } from 'lucide-react'

// Tipos compartidos entre el modal, el formulario y la acción de guardado.
export interface CatalogStudy { name: string; description?: string | null; indication?: string | null }
export interface CatalogSection { section: string; studies: CatalogStudy[] }
export interface RequestStudy { section: string; name: string; description?: string | null; indication?: string | null }
export interface StudyRequestValue {
  studies: RequestStudy[]
  otherStudies: string
  // Subconjunto de estudios agregados manualmente que el médico marcó para guardar en el catálogo.
  manualToCatalog: RequestStudy[]
}

// Estilos del modal (mismos que LabOrderModal para conservar la apariencia).
const styles: Record<string, React.CSSProperties> = {
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: '14px',
    padding: '1.75rem',
    maxWidth: '440px',
    width: '100%',
    boxShadow: '0 20px 50px rgba(15,23,42,0.3)',
  },
}

/** Agrupa una lista de estudios [{section,name}] por sección conservando el orden. */
export function groupStudiesBySection(studies: RequestStudy[]): { section: string; names: string[] }[] {
  const out: { section: string; names: string[] }[] = []
  for (const s of (studies || [])) {
    let g = out.find((x) => x.section === s.section)
    if (!g) { g = { section: s.section, names: [] }; out.push(g) }
    g.names.push(s.name)
  }
  return out
}

/** Lista de solo lectura de una solicitud de estudios, agrupada por sección (+ "Otros"). */
export function StudyRequestList({ studies, otherStudies }: { studies: RequestStudy[]; otherStudies?: string | null }) {
  const groups = groupStudiesBySection(studies)
  const otherLines = (otherStudies || '').split('\n').map((s) => s.trim()).filter(Boolean)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {groups.map((g) => (
        <div key={g.section}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--primary)' }}>{g.section}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>{g.names.join(' · ')}</div>
        </div>
      ))}
      {otherLines.length > 0 && (
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>Otros</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', whiteSpace: 'pre-line' }}>{otherLines.join('\n')}</div>
        </div>
      )}
    </div>
  )
}

/** Modal para armar la solicitud de estudios (catálogo en checkboxes por sección + alta manual + "Otros"). */
export function StudyRequestModal({ catalog, initial, onSave, onClose }: {
  catalog: CatalogSection[]
  initial: StudyRequestValue
  onSave: (v: StudyRequestValue) => void
  onClose: () => void
}) {
  const key = (section: string, name: string) => `${section}||${name}`

  // Estudios del catálogo seleccionados.
  const [selected, setSelected] = useState<Set<string>>(() => {
    const fromCatalog = new Set(catalog.flatMap((c) => c.studies.map((s) => key(c.section, s.name))))
    return new Set((initial.studies || []).map((s) => key(s.section, s.name)).filter((k) => fromCatalog.has(k)))
  })
  // Estudios agregados manualmente (no están en el catálogo). Conservan si se guardan o no.
  const [manual, setManual] = useState<(RequestStudy & { saveToCatalog: boolean })[]>(() => {
    const fromCatalog = new Set(catalog.flatMap((c) => c.studies.map((s) => key(c.section, s.name))))
    const saveSet = new Set((initial.manualToCatalog || []).map((s) => key(s.section, s.name)))
    return (initial.studies || [])
      .filter((s) => !fromCatalog.has(key(s.section, s.name)))
      .map((s) => ({ ...s, saveToCatalog: saveSet.has(key(s.section, s.name)) }))
  })
  const [otherStudies, setOtherStudies] = useState(initial.otherStudies || '')

  // Mini-formulario de alta manual.
  const sectionOptions = catalog.map((c) => c.section)
  const [showManualForm, setShowManualForm] = useState(false)
  const [mName, setMName] = useState('')
  const [mSection, setMSection] = useState(sectionOptions[0] || 'Otros')
  const [mDescription, setMDescription] = useState('')
  const [mIndication, setMIndication] = useState('')
  const [mSaveToCatalog, setMSaveToCatalog] = useState(true)

  const toggle = (section: string, name: string) => {
    const k = key(section, name)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  const addManual = () => {
    const name = mName.trim()
    if (!name) return
    const section = (mSection || 'Otros').trim() || 'Otros'
    setManual((prev) => [...prev, {
      section,
      name,
      description: mDescription.trim() || null,
      indication: mIndication.trim() || null,
      saveToCatalog: mSaveToCatalog,
    }])
    setMName(''); setMDescription(''); setMIndication(''); setShowManualForm(false)
  }

  const count = selected.size + manual.length + (otherStudies.trim() ? 1 : 0)

  const save = () => {
    const studies: RequestStudy[] = []
    // Catálogo (resuelve descripción + indicación desde el catálogo para el snapshot).
    for (const cat of catalog) {
      for (const st of cat.studies) {
        if (selected.has(key(cat.section, st.name))) {
          studies.push({ section: cat.section, name: st.name, description: st.description ?? null, indication: st.indication ?? null })
        }
      }
    }
    // Manuales (van al snapshot tal cual; los marcados, además, al catálogo de la clínica).
    const manualToCatalog: RequestStudy[] = []
    for (const m of manual) {
      const s: RequestStudy = { section: m.section, name: m.name, description: m.description ?? null, indication: m.indication ?? null }
      studies.push(s)
      if (m.saveToCatalog) manualToCatalog.push(s)
    }
    onSave({ studies, otherStudies, manualToCatalog })
  }

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modalCard, maxWidth: '920px', width: '100%', maxHeight: '92vh', padding: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Encabezado */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ClipboardList size={18} color="var(--primary)" /> Solicitud de Estudios
          </h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}><X size={20} /></button>
        </div>

        {/* Cuerpo (scroll) */}
        <div style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', flex: 1 }}>
          {catalog.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1.5rem 0' }}>
              No hay estudios configurados. Pídele a un administrador que cargue el catálogo en
              <strong> Configuración → Catálogo de Estudios</strong>, o agrega uno manualmente abajo.
            </p>
          ) : (
            <div style={{ columnWidth: '260px', columnGap: '1.5rem' }}>
              {catalog.map((cat) => (
                <div key={cat.section} style={{ breakInside: 'avoid', marginBottom: '1.1rem', display: 'inline-block', width: '100%' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', marginBottom: '0.45rem' }}>{cat.section}</div>
                  {cat.studies.map((st) => (
                    <label key={st.name} title={st.indication || st.description || ''} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem', padding: '0.15rem 0', fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selected.has(key(cat.section, st.name))}
                        onChange={() => toggle(cat.section, st.name)}
                        style={{ marginTop: '0.15rem', width: '15px', height: '15px', flexShrink: 0, cursor: 'pointer' }}
                      />
                      <span>{st.name}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Estudios agregados manualmente */}
          {manual.length > 0 && (
            <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {manual.map((m, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#f0fdfa', border: '1px solid #99f6e4', color: '#0f766e', borderRadius: '999px', padding: '0.25rem 0.7rem', fontSize: '0.82rem', fontWeight: 600 }}>
                  {m.name}
                  <span style={{ fontSize: '0.68rem', color: '#0d9488', opacity: 0.8 }}>· {m.section}{m.saveToCatalog ? ' · se guardará' : ''}</span>
                  <button type="button" onClick={() => setManual((prev) => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0f766e', display: 'flex', padding: 0 }}><Trash2 size={13} /></button>
                </span>
              ))}
            </div>
          )}

          {/* Alta manual de un estudio */}
          <div style={{ marginTop: '1rem' }}>
            {!showManualForm ? (
              <button type="button" className="btn btn-secondary" style={{ gap: '0.4rem' }} onClick={() => setShowManualForm(true)}>
                <Plus size={15} /> Agregar estudio manualmente
              </button>
            ) : (
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1rem', background: '#f8fafc' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Nombre del estudio</label>
                    <input className="form-input" value={mName} onChange={(e) => setMName(e.target.value)} placeholder="Ej. Tomografía de cráneo" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Sección</label>
                    {sectionOptions.length > 0 ? (
                      <select className="form-input" value={mSection} onChange={(e) => setMSection(e.target.value)}>
                        {sectionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                        <option value="Otros">Otros</option>
                      </select>
                    ) : (
                      <input className="form-input" value={mSection} onChange={(e) => setMSection(e.target.value)} placeholder="Ej. Radiología" />
                    )}
                  </div>
                </div>
                <div className="form-group" style={{ margin: '0.75rem 0 0' }}>
                  <label className="form-label">Descripción (opcional)</label>
                  <input className="form-input" value={mDescription} onChange={(e) => setMDescription(e.target.value)} placeholder="Breve descripción del estudio" />
                </div>
                <div className="form-group" style={{ margin: '0.75rem 0 0' }}>
                  <label className="form-label">Indicaciones para el paciente (opcional)</label>
                  <textarea className="form-input" value={mIndication} onChange={(e) => setMIndication(e.target.value)} rows={3} placeholder="Preparación: ayuno, suspender medicamentos, acompañante…" style={{ resize: 'vertical' }} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', margin: '0.75rem 0 0', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={mSaveToCatalog} onChange={(e) => setMSaveToCatalog(e.target.checked)} style={{ width: '15px', height: '15px', cursor: 'pointer' }} />
                  <span>Guardar en el catálogo de la clínica para la próxima vez</span>
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem' }}>
                  <button type="button" className="btn btn-primary" disabled={!mName.trim()} onClick={addManual}>Agregar</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowManualForm(false)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>

          {/* Otros (texto libre, sin indicación) */}
          <div style={{ marginTop: '1rem' }}>
            <label className="form-label">Otros (uno por línea)</label>
            <textarea
              className="form-input"
              value={otherStudies}
              onChange={(e) => setOtherStudies(e.target.value)}
              placeholder="Estudios o notas que no estén en la lista…"
              rows={2}
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>

        {/* Pie */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>{count} {count === 1 ? 'seleccionado' : 'seleccionados'}</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={save}>Guardar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
