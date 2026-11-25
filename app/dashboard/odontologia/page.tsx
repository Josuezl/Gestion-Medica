import { notFound } from 'next/navigation'
import { getSessionProfile } from '@/utils/session'
import ListadoConsultas from '@/app/dashboard/components/ListadoConsultas'
import { puedeRegistrarOdontologia } from '@/utils/permissions'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

// Mismo formato que «Historial de Consultas», pero solo con las consultas dentales. La ve todo el
// personal de una clínica con licencia de odontología; solo el odontólogo ve el botón de nueva consulta.
export default async function OdontologiaPage({ searchParams }: PageProps) {
  const session = await getSessionProfile()
  const profile = session?.profile
  if (!profile?.odontologia_habilitada || !profile.clinic_id) notFound()

  const resolvedSearchParams = await searchParams
  const qParam = resolvedSearchParams.q
  const searchQuery = (Array.isArray(qParam) ? qParam[0] : qParam) || ''
  const pageParam = resolvedSearchParams.page
  const currentPage = parseInt((Array.isArray(pageParam) ? pageParam[0] : pageParam) || '1', 10) || 1
  const esOdontologo = puedeRegistrarOdontologia(profile)

  return (
    <ListadoConsultas
      clinicId={profile.clinic_id}
      searchQuery={searchQuery}
      currentPage={currentPage}
      tipo="DENTAL"
      basePath="/dashboard/odontologia"
      titulo="Consultas odontológicas"
      subtitulo="Historial de consultas dentales de la clínica"
      accion={esOdontologo ? { href: '/dashboard/patients', texto: 'Nueva consulta dental (Buscar paciente)' } : null}
      placeholder="Buscar por paciente, diagnóstico, odontólogo o motivo..."
      vacio="Aún no se han registrado consultas dentales en esta clínica."
      sufijoExpediente="?tab=odontograma"
    />
  )
}
