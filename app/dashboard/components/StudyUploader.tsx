'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { checkStudyQuota, recordMedicalStudy } from '../patients/actions'
import { createClient } from '@/utils/supabase/client'
import { Upload, Loader2, Check } from 'lucide-react'

const MAX_FILE_BYTES = 26214400 // 25 MB

/**
 * Formulario reutilizable para subir un estudio médico de un paciente.
 * Sube el archivo DIRECTO del navegador a Supabase Storage (evita los límites de body
 * de Server Actions / Vercel); valida tamaño + cuota del plan; muestra progreso y estado.
 */
export default function StudyUploader({ patientId }: { patientId: string }) {
  const router = useRouter()
  const [studyFile, setStudyFile] = useState<File | null>(null)
  const [studyName, setStudyName] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUploadStudy(event: React.FormEvent) {
    event.preventDefault()
    if (!studyFile || !studyName.trim()) {
      setUploadError('Por favor completa el nombre del estudio y selecciona un archivo.')
      return
    }
    if (studyFile.size > MAX_FILE_BYTES) {
      setUploadError('El archivo supera el límite de 25 MB. Comprime la imagen e intenta de nuevo.')
      return
    }

    setUploadError(null)
    setUploadSuccess(false)
    setUploadLoading(true)

    // 1. Pre-chequeo de cuota/tamaño (devuelve el clinic_id de forma confiable)
    const quota = await checkStudyQuota(studyFile.size)
    if (quota.error || !quota.clinicId) {
      setUploadError(quota.error || 'No se pudo validar la cuota.')
      setUploadLoading(false)
      return
    }

    // 2. Subir DIRECTO a Supabase Storage desde el navegador
    const supabase = createClient()
    const fileExt = studyFile.name.split('.').pop()
    const filePath = `${quota.clinicId}/${patientId}/${Date.now()}.${fileExt}`
    const { error: upErr } = await supabase.storage
      .from('medical-studies')
      .upload(filePath, studyFile, { contentType: studyFile.type, upsert: true })

    if (upErr) {
      setUploadError(`Error al subir archivo: ${upErr.message}`)
      setUploadLoading(false)
      return
    }

    // 3. Registrar metadatos
    const result = await recordMedicalStudy(patientId, studyName, filePath)
    setUploadLoading(false)
    if (result.error) {
      setUploadError(result.error)
    } else {
      setStudyFile(null)
      setStudyName('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      router.refresh()
      setUploadSuccess(true)
      setTimeout(() => setUploadSuccess(false), 4000)
    }
  }

  return (
    <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem' }}>Subir Nuevo Estudio</h4>
      {uploadError && <div className="badge badge-danger" style={{ marginBottom: '1rem', padding: '0.5rem', width: '100%' }}>{uploadError}</div>}
      <form onSubmit={handleUploadStudy} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: 1, minWidth: '180px', marginBottom: 0 }}>
          <input
            className="form-input"
            placeholder="Nombre del estudio (Ej. Radiografía Tórax)"
            value={studyName}
            onChange={(e) => setStudyName(e.target.value)}
            disabled={uploadLoading}
            required
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <input
            ref={fileInputRef}
            type="file"
            className="form-input"
            onChange={(e) => setStudyFile(e.target.files?.[0] || null)}
            disabled={uploadLoading}
            required
            accept=".pdf,.png,.jpg,.jpeg"
          />
        </div>
        <button type="submit" className="btn btn-primary" style={{ gap: '0.4rem' }} disabled={uploadLoading}>
          {uploadLoading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {uploadLoading ? 'Subiendo...' : 'Subir Estudio'}
        </button>
      </form>

      {uploadLoading && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Subiendo estudio...</span>
            {studyFile && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{(studyFile.size / (1024 * 1024)).toFixed(1)} MB</span>}
          </div>
          <div className="study-progress-track"><div className="study-progress-bar" /></div>
        </div>
      )}

      {uploadSuccess && (
        <div style={{
          marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.6rem 0.85rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600,
          backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #86efac',
        }}>
          <Check size={16} /> Estudio subido correctamente
        </div>
      )}

      <style jsx>{`
        .study-progress-track {
          height: 6px; border-radius: 4px; background: #e2e8f0; overflow: hidden;
        }
        .study-progress-bar {
          height: 100%; width: 40%; border-radius: 4px;
          background: linear-gradient(90deg, #14b8a6, #0d9488);
          animation: studyIndeterminate 1.1s ease-in-out infinite;
        }
        @keyframes studyIndeterminate {
          0% { margin-left: -40%; }
          100% { margin-left: 100%; }
        }
      `}</style>
    </div>
  )
}
