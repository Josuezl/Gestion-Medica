'use client'

import React from 'react'
import { ClipboardList, Printer, ChevronUp, ChevronDown } from 'lucide-react'
import { doctorShortName } from '@/utils/doctorName'

/** Agrupa los estudios [{section,name}] de una solicitud por sección conservando el orden. */
function groupStudies(studies: any[]): { section: string; names: string[] }[] {
  const out: { section: string; names: string[] }[] = []
  for (const s of (Array.isArray(studies) ? studies : [])) {
    let g = out.find((x) => x.section === s.section)
    if (!g) { g = { section: s.section, names: [] }; out.push(g) }
    g.names.push(s.name)
  }
  return out
}

/**
 * Pestaña "Historial de Solicitudes de Estudios" del expediente del paciente.
 * Componente presentacional: recibe los estilos del contenedor y el estado de expansión.
 * Espejo de LabOrdersTab (solo impresión).
 */
export default function StudyRequestsTab({ studyRequests, styles, expandedStudyRequest, setExpandedStudyRequest }: {
  studyRequests: any[]
  styles: any
  expandedStudyRequest: string | null
  setExpandedStudyRequest: (id: string | null) => void
}) {
  return (
            <div style={styles.tabView}>
              <div style={styles.tabHeader}>
                <h3 style={styles.tabTitle}>Historial de Solicitudes de Estudios</h3>
                <span className="badge badge-info">{studyRequests.length} Solicitudes</span>
              </div>

              {studyRequests.length === 0 ? (
                <div style={styles.tabEmptyState}>
                  <ClipboardList size={40} color="var(--text-muted)" style={{ opacity: 0.5, marginBottom: '1rem' }} />
                  <p>No se han generado solicitudes de estudios para este paciente aún.</p>
                </div>
              ) : (
                <div style={styles.studiesList}>
                  {studyRequests.map((order) => {
                    const date = new Date(order.created_at).toLocaleDateString('es-HN')
                    const docName = doctorShortName(order.user_profiles?.first_name, order.user_profiles?.last_name, order.user_profiles?.gender)
                    const isExpanded = expandedStudyRequest === order.id
                    const groups = groupStudies(order.studies)
                    const otherLines = (order.other_studies || '').split('\n').map((s: string) => s.trim()).filter(Boolean)
                    const total = (Array.isArray(order.studies) ? order.studies.length : 0) + otherLines.length
                    const withIndication = (Array.isArray(order.studies) ? order.studies : []).filter((s: any) => (s.indication || '').trim())

                    return (
                      <div key={order.id} className="card" style={{ ...styles.studyRow, flexDirection: 'column', alignItems: 'stretch' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                          <div
                            style={{ ...styles.studyInfo, cursor: 'pointer', flex: 1 }}
                            onClick={() => setExpandedStudyRequest(isExpanded ? null : order.id)}
                          >
                            <ClipboardList size={22} color="var(--primary)" />
                            <div style={{ flex: 1 }}>
                              <p style={styles.studyNameText}>Solicitud de Estudios{order.verification_code ? ` - Código: ${order.verification_code}` : ''}</p>
                              <p style={styles.studyMeta}>Solicitada el {date} por {docName} · {total} {total === 1 ? 'estudio' : 'estudios'}</p>
                            </div>
                            {isExpanded ? <ChevronUp size={18} color="var(--text-muted)" /> : <ChevronDown size={18} color="var(--text-muted)" />}
                          </div>
                          <div style={styles.studyActions}>
                            <a
                              href={`/study-requests/${order.id}/print`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-secondary"
                              style={{ padding: '0.4rem 0.6rem', backgroundColor: '#e2e8f0', color: '#475569', border: 'none' }}
                              title="Imprimir Solicitud de Estudios"
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
                              <div key={g.section}>
                                <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary)' }}>{g.section}</p>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)' }}>{g.names.join(' · ')}</p>
                              </div>
                            ))}
                            {otherLines.length > 0 && (
                              <div>
                                <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Otros</p>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', whiteSpace: 'pre-line' }}>{otherLines.join('\n')}</p>
                              </div>
                            )}
                            {withIndication.length > 0 && (
                              <div style={{ borderTop: '1px solid rgba(13, 148, 136, 0.12)', paddingTop: '0.75rem' }}>
                                <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Indicaciones para el paciente</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                  {withIndication.map((s: any, i: number) => (
                                    <div key={i}>
                                      <p style={{ margin: '0 0 0.15rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>{s.name}</p>
                                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'pre-line' }}>{(s.indication || '').trim()}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {groups.length === 0 && otherLines.length === 0 && (
                              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Sin estudios especificados.</p>
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
