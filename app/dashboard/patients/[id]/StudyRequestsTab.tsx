'use client'

import React from 'react'
import { ClipboardList, Printer, ChevronUp, ChevronDown, Mail, Loader2 } from 'lucide-react'
import { doctorShortName } from '@/utils/doctorName'
import type { StudyRequestRow, StudyRequestItem } from '@/utils/clinicalTypes'

/** Agrupa los estudios [{section,name}] de una solicitud por sección conservando el orden. */
function groupStudies(studies: StudyRequestItem[] | null | undefined): { section: string; names: string[] }[] {
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
export default function StudyRequestsTab({ studyRequests, styles, expandedStudyRequest, setExpandedStudyRequest, onWhatsApp, onSendEmail, sendingEmailId, emailMsg }: {
  studyRequests: StudyRequestRow[]
  styles: Record<string, React.CSSProperties>
  expandedStudyRequest: string | null
  setExpandedStudyRequest: (id: string | null) => void
  onWhatsApp?: (order: StudyRequestRow) => void
  onSendEmail?: (orderId: string) => void
  sendingEmailId?: string | null
  emailMsg?: { type: 'success' | 'error', text: string, id?: string } | null
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
                    const withIndication = (Array.isArray(order.studies) ? order.studies : []).filter((s) => (s.indication || '').trim())

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
                            {onWhatsApp && (
                              <a
                                href="#"
                                onClick={(e) => { e.preventDefault(); onWhatsApp(order) }}
                                className="btn"
                                style={{ padding: '0.4rem 0.6rem', backgroundColor: '#dcf8c6', color: '#128C7E', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                title="Enviar por WhatsApp"
                              >
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ display: 'block' }}>
                                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.003 5.324 5.328 0 11.896 0c3.181.001 6.173 1.24 8.424 3.493 2.25 2.253 3.487 5.244 3.484 8.427-.004 6.578-5.329 11.902-11.897 11.902-2.003-.001-3.973-.505-5.727-1.467L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.725 1.45 5.247 0 9.518-4.268 9.52-9.51 0-2.54-1-4.927-2.817-6.724-1.815-1.8-4.223-2.79-6.733-2.792-5.253 0-9.526 4.268-9.529 9.511 0 1.63.43 3.22 1.25 4.63l-.993 3.626 3.725-.976zm11.233-6.006c-.3-.15-1.772-.875-2.047-.975-.276-.1-.477-.15-.677.15-.2.3-.777.975-.952 1.175-.176.2-.351.225-.651.075-1.204-.6-2.002-1.054-2.8-2.427-.21-.362.21-.337.6-.113.35.2.775.9.875 1.1.1.2.05.375-.025.525-.075.15-.677.8-1.002 1.175-.325.375-.65.3-.95.15-1.157-.58-1.907-1.01-2.67-2.327-.15-.257-.15-.425.075-.65.2-.2.45-.525.677-.8.225-.275.3-.475.45-.775.15-.3.075-.575-.025-.775-.1-.2-.677-1.625-.927-2.225-.244-.588-.492-.51-.677-.52l-.576-.007c-.2 0-.527.075-.803.375-.276.3-1.053 1.025-1.053 2.5 0 1.475 1.078 2.9 1.228 3.1.15.2 2.122 3.24 5.141 4.542.717.31 1.277.494 1.714.633.72.228 1.376.196 1.894.118.577-.087 1.772-.725 2.022-1.425.25-.7.25-1.3 1.75-1.425-.075-.125-.275-.2-.575-.35z" />
                                </svg>
                              </a>
                            )}
                            {onSendEmail && (
                              <button
                                onClick={() => onSendEmail(order.id)}
                                disabled={sendingEmailId === order.id}
                                className="btn btn-secondary"
                                style={{ padding: '0.4rem 0.6rem', backgroundColor: sendingEmailId === order.id ? '#c7d2fe' : '#e0e7ff', color: '#4338ca', border: 'none', cursor: sendingEmailId === order.id ? 'wait' : 'pointer' }}
                                title="Enviar Solicitud por Correo Electrónico"
                              >
                                {sendingEmailId === order.id ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                              </button>
                            )}
                          </div>
                        </div>

                        {emailMsg && emailMsg.id === order.id && (
                          <p style={{ margin: '0.6rem 0 0', fontSize: '0.8rem', fontWeight: 600, color: emailMsg.type === 'success' ? '#15803d' : '#dc2626' }}>{emailMsg.text}</p>
                        )}

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
                                  {withIndication.map((s, i) => (
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
