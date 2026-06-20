'use client'

import React from 'react'
import { Beaker, Printer, ChevronUp, ChevronDown } from 'lucide-react'
import { doctorShortName } from '@/utils/doctorName'

/** Agrupa los exámenes [{category,name}] de una orden por categoría conservando el orden. */
function groupLabTests(tests: any[]): { category: string; names: string[] }[] {
  const out: { category: string; names: string[] }[] = []
  for (const t of (Array.isArray(tests) ? tests : [])) {
    let g = out.find((x) => x.category === t.category)
    if (!g) { g = { category: t.category, names: [] }; out.push(g) }
    g.names.push(t.name)
  }
  return out
}

/**
 * Pestaña "Historial de Órdenes de Laboratorio" del expediente del paciente.
 * Componente presentacional: recibe los estilos del contenedor y el estado de expansión.
 * Extraído de PatientDetailsClient sin alterar el marcado ni la lógica.
 */
export default function LabOrdersTab({ labOrders, styles, expandedLabOrder, setExpandedLabOrder }: {
  labOrders: any[]
  styles: any
  expandedLabOrder: string | null
  setExpandedLabOrder: (id: string | null) => void
}) {
  return (
            <div style={styles.tabView}>
              <div style={styles.tabHeader}>
                <h3 style={styles.tabTitle}>Historial de Órdenes de Laboratorio</h3>
                <span className="badge badge-info">{labOrders.length} Órdenes</span>
              </div>

              {labOrders.length === 0 ? (
                <div style={styles.tabEmptyState}>
                  <Beaker size={40} color="var(--text-muted)" style={{ opacity: 0.5, marginBottom: '1rem' }} />
                  <p>No se han generado órdenes de laboratorio para este paciente aún.</p>
                </div>
              ) : (
                <div style={styles.studiesList}>
                  {labOrders.map((order) => {
                    const date = new Date(order.created_at).toLocaleDateString('es-HN')
                    const docName = doctorShortName(order.user_profiles?.first_name, order.user_profiles?.last_name, order.user_profiles?.gender)
                    const isExpanded = expandedLabOrder === order.id
                    const groups = groupLabTests(order.tests)
                    const otherLines = (order.other_tests || '').split('\n').map((s: string) => s.trim()).filter(Boolean)
                    const total = (Array.isArray(order.tests) ? order.tests.length : 0) + otherLines.length

                    return (
                      <div key={order.id} className="card" style={{ ...styles.studyRow, flexDirection: 'column', alignItems: 'stretch' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                          <div
                            style={{ ...styles.studyInfo, cursor: 'pointer', flex: 1 }}
                            onClick={() => setExpandedLabOrder(isExpanded ? null : order.id)}
                          >
                            <Beaker size={22} color="var(--primary)" />
                            <div style={{ flex: 1 }}>
                              <p style={styles.studyNameText}>Orden de Laboratorio{order.verification_code ? ` - Código: ${order.verification_code}` : ''}</p>
                              <p style={styles.studyMeta}>Solicitada el {date} por {docName} · {total} {total === 1 ? 'examen' : 'exámenes'}</p>
                            </div>
                            {isExpanded ? <ChevronUp size={18} color="var(--text-muted)" /> : <ChevronDown size={18} color="var(--text-muted)" />}
                          </div>
                          <div style={styles.studyActions}>
                            <a
                              href={`/lab-orders/${order.id}/print`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-secondary"
                              style={{ padding: '0.4rem 0.6rem', backgroundColor: '#e2e8f0', color: '#475569', border: 'none' }}
                              title="Imprimir Orden de Laboratorio"
                            >
                              <Printer size={14} />
                            </a>
                          </div>
                        </div>

                        {isExpanded && (
                          <div style={{
                            marginTop: '1rem',
                            padding: '1rem',
                            backgroundColor: 'rgba(13, 148, 136, 0.04)',
                            borderRadius: '8px',
                            border: '1px solid rgba(13, 148, 136, 0.12)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.75rem',
                          }}>
                            {groups.map((g) => (
                              <div key={g.category}>
                                <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary)' }}>{g.category}</p>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)' }}>{g.names.join(' · ')}</p>
                              </div>
                            ))}
                            {otherLines.length > 0 && (
                              <div>
                                <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Otros</p>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', whiteSpace: 'pre-line' }}>{otherLines.join('\n')}</p>
                              </div>
                            )}
                            {groups.length === 0 && otherLines.length === 0 && (
                              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Sin exámenes especificados.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
  )
}
