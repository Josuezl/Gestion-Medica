'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteMedicalStudy, getStudySignedUrl } from '../patients/actions'
import { FileSpreadsheet, Download, Trash2, Loader2 } from 'lucide-react'

interface StudyListProps {
  studies: any[]
  currentUserId: string
  currentUserRole: string
  isOrgAdmin: boolean
}

/**
 * Lista reutilizable de estudios médicos con acción de eliminar.
 * El botón "Eliminar" solo aparece para el médico que subió el estudio o para el org-admin
 * (RLS lo reconfirma del lado del servidor).
 */
export default function StudyList({ studies, currentUserId, currentUserRole, isOrgAdmin }: StudyListProps) {
  const router = useRouter()
  const [deletingStudyId, setDeletingStudyId] = useState<string | null>(null)
  const [openingStudyId, setOpeningStudyId] = useState<string | null>(null)

  // M5: la URL firmada se genera AL HACER CLIC (no por cada estudio al cargar la página).
  // Se abre la pestaña dentro del gesto del clic para que el navegador no la bloquee, y luego
  // se navega a la URL ya firmada.
  async function handleOpenStudy(studyId: string) {
    const win = window.open('about:blank', '_blank')
    setOpeningStudyId(studyId)
    const res = await getStudySignedUrl(studyId)
    setOpeningStudyId(null)
    if (res.error || !res.url) {
      win?.close()
      alert(res.error || 'No se pudo abrir el estudio.')
      return
    }
    if (win) win.location.href = res.url
  }

  const canDeleteStudy = (study: any) =>
    isOrgAdmin || (study.uploaded_by === currentUserId && currentUserRole === 'DOCTOR')

  async function handleDeleteStudy(studyId: string) {
    if (!confirm('¿Eliminar este estudio? Esta acción no se puede deshacer.')) return
    setDeletingStudyId(studyId)
    const result = await deleteMedicalStudy(studyId)
    setDeletingStudyId(null)
    if (result.error) alert(result.error)
    else router.refresh()
  }

  if (!studies || studies.length === 0) {
    return (
      <div style={styles.emptyState}>
        <FileSpreadsheet size={40} color="var(--text-muted)" style={{ opacity: 0.5, marginBottom: '1rem' }} />
        <p>No hay radiografías, ultrasonidos o resultados de laboratorio subidos para este paciente.</p>
      </div>
    )
  }

  return (
    <div style={styles.studiesList}>
      {studies.map((study) => {
        const date = new Date(study.created_at).toLocaleDateString('es-HN')
        return (
          <div key={study.id} className="card" style={styles.studyRow}>
            <div style={styles.studyInfo}>
              <FileSpreadsheet size={22} color="var(--secondary)" />
              <div>
                <p style={styles.studyNameText}>{study.name}</p>
                <p style={styles.studyMeta}>Subido el {date}</p>
              </div>
            </div>
            <div style={styles.studyActions}>
              <button
                type="button"
                onClick={() => handleOpenStudy(study.id)}
                disabled={openingStudyId === study.id}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', gap: '0.25rem', display: 'inline-flex', alignItems: 'center' }}
              >
                {openingStudyId === study.id
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Download size={14} />}
                Ver / Descargar
              </button>
              {canDeleteStudy(study) && (
                <button
                  onClick={() => handleDeleteStudy(study.id)}
                  disabled={deletingStudyId === study.id}
                  title="Eliminar estudio"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                    padding: '0.4rem 0.8rem', fontSize: '0.75rem', cursor: 'pointer',
                    background: 'transparent', color: '#dc2626',
                    border: '1px solid #fecaca', borderRadius: '8px', fontWeight: 600,
                  }}
                >
                  {deletingStudyId === study.id
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Trash2 size={14} />}
                  Eliminar
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  emptyState: {
    textAlign: 'center',
    padding: '2.5rem 1rem',
    color: 'var(--text-muted)',
  },
  studiesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  studyRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 1.25rem',
  },
  studyInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  studyNameText: {
    fontWeight: 700,
    fontSize: '0.95rem',
    color: 'var(--text-main)',
  },
  studyMeta: {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    marginTop: '0.2rem',
  },
  studyActions: {
    display: 'flex',
    gap: '0.5rem',
  },
}
