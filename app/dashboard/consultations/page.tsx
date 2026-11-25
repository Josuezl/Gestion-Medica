import { redirect } from 'next/navigation'
import { canDoClinical } from '@/utils/permissions'
import { getSessionProfile } from '@/utils/session'
import ListadoConsultas from '@/app/dashboard/components/ListadoConsultas'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function ConsultationsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams
  const qParam = resolvedSearchParams.q
  const searchQuery = (Array.isArray(qParam) ? qParam[0] : qParam) || ''
  
  const pageParam = resolvedSearchParams.page
  const currentPage = parseInt((Array.isArray(pageParam) ? pageParam[0] : pageParam) || '1', 10) || 1

  // 1. Sesión + perfil memoizados por request (compartidos con el layout, P1-2)
  const session = await getSessionProfile()
  if (!session) return null
  const { profile } = session

  // El historial clínico es trabajo médico: asistente y enfermera no pueden verlo.
  if (!canDoClinical(profile?.role)) {
    redirect('/dashboard')
  }

  return (
    <ListadoConsultas
      clinicId={profile?.clinic_id}
      searchQuery={searchQuery}
      currentPage={currentPage}
      basePath="/dashboard/consultations"
      titulo="Consultas"
      subtitulo="Historial de consultas de evolución, diagnósticos y tratamientos de la clínica"
      accion={{ href: '/dashboard/patients', texto: 'Nueva Consulta (Buscar Paciente)' }}
      placeholder="Buscar por paciente, diagnóstico, médico o motivo..."
      vacio="Aún no se han registrado consultas en esta clínica."
    />
  )
}
