'use client'

import React, { useState } from 'react'
import { FlaskConical, X } from 'lucide-react'

// Estilos del modal (copiados tal cual desde NewConsultationClient para no alterar la apariencia).
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

/** Agrupa una lista de exámenes [{category,name}] por categoría conservando el orden. */
export function groupTestsByCategory(tests: { category: string; name: string }[]): { category: string; names: string[] }[] {
  const out: { category: string; names: string[] }[] = []
  for (const t of (tests || [])) {
    let g = out.find((x) => x.category === t.category)
    if (!g) { g = { category: t.category, names: [] }; out.push(g) }
    g.names.push(t.name)
  }
  return out
}

/** Lista de solo lectura de una orden de laboratorio, agrupada por categoría (+ "Otros"). */
export function LabOrderList({ tests, otherTests }: { tests: { category: string; name: string }[]; otherTests?: string | null }) {
  const groups = groupTestsByCategory(tests)
  const otherLines = (otherTests || '').split('\n').map((s) => s.trim()).filter(Boolean)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {groups.map((g) => (
        <div key={g.category}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--primary)' }}>{g.category}</div>
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

/** Modal para armar la orden de laboratorio (catálogo en checkboxes por categoría + "Otros"). */
export function LabOrderModal({ catalog, initial, onSave, onClose }: {
  catalog: { category: string; tests: string[] }[]
  initial: { tests: { category: string; name: string }[]; otherTests: string }
  onSave: (v: { tests: { category: string; name: string }[]; otherTests: string }) => void
  onClose: () => void
}) {
  const key = (category: string, name: string) => `${category}||${name}`
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial.tests.map(t => key(t.category, t.name))))
  const [otherTests, setOtherTests] = useState(initial.otherTests)

  const toggle = (category: string, name: string) => {
    const k = key(category, name)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }
  const count = selected.size + (otherTests.trim() ? 1 : 0)

  const save = () => {
    const tests: { category: string; name: string }[] = []
    for (const cat of catalog) for (const name of cat.tests) if (selected.has(key(cat.category, name))) tests.push({ category: cat.category, name })
    onSave({ tests, otherTests })
  }

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modalCard, maxWidth: '920px', width: '100%', maxHeight: '92vh', padding: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Encabezado */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FlaskConical size={18} color="var(--primary)" /> Orden de Laboratorio
          </h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}><X size={20} /></button>
        </div>

        {/* Cuerpo (scroll) */}
        <div style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', flex: 1 }}>
          {catalog.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>
              No hay laboratorios configurados. Pídele a un administrador que cargue el catálogo en
              <strong> Configuración → Catálogo de Laboratorio</strong>.
            </p>
          ) : (
            <div style={{ columnWidth: '230px', columnGap: '1.5rem' }}>
              {catalog.map((cat) => (
                <div key={cat.category} style={{ breakInside: 'avoid', marginBottom: '1.1rem', display: 'inline-block', width: '100%' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', marginBottom: '0.45rem' }}>{cat.category}</div>
                  {cat.tests.map((name) => (
                    <label key={name} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem', padding: '0.15rem 0', fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selected.has(key(cat.category, name))}
                        onChange={() => toggle(cat.category, name)}
                        style={{ marginTop: '0.15rem', width: '15px', height: '15px', flexShrink: 0, cursor: 'pointer' }}
                      />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Otros (texto libre) */}
          <div style={{ marginTop: '1rem' }}>
            <label className="form-label">Otros (uno por línea)</label>
            <textarea
              className="form-input"
              value={otherTests}
              onChange={(e) => setOtherTests(e.target.value)}
              placeholder="Exámenes que no estén en la lista…"
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
