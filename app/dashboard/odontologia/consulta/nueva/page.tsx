import { notFound, redirect } from 'next/navigation'
import { getAuthContext } from '@/utils/auth-guard'
import { createClient } from '@/utils/supabase/server'
import { denticionPorEdad, estadoVacio, validarEstado, type Denticion } from '@/utils/odontograma'
import NuevaConsultaDentalClient from './NuevaConsultaDentalClient'

interface PageProps {
  searchParams: Promise<{ patientId?: string | string[]; appointmentId?: string | string[] }>
}

async function cargarConsultas(supabase: Awaited<ReturnType<typeof createClient>>, patientId: string) {
  const consulta = supabase.from('consultations')
    .select('id, tipo, created_at, reason_for_visit, symptoms, physical_exam, intraoral_exam, procedures_done, diagnosis, treatment_plan, user_profiles(first_name, last_name, gender)')
    .eq('patient_id', patientId).order('created_at', { ascending: false }).order('id', { ascending: false })
  const consultas = []
  const lote = 500

  for (let inicio = 0; ; inicio += lote) {
    const { data, error } = await consulta.range(inicio, inicio + lote - 1)
    if (error) throw new Error('No se pudo cargar el historial de consultas.')

    consultas.push(...data.map((fila) => ({
      ...fila,
      user_profiles: Array.isArray(fila.user_profiles) ? fila.user_profiles[0] : fila.user_profiles,
    })))
    if (data.length < lote) return consultas
  }
}

export default async function NuevaConsultaDentalPage({ searchParams }: PageProps) {
  const { patientId, appointmentId } = await searchParams
  if (typeof patientId !== 'string' || !patientId) redirect('/dashboard/patients')

  const ctx = await getAuthContext()
  if (!ctx?.isDentist) redirect(`/dashboard/patients/${encodeURIComponent(patientId)}`)

  const supabase = await createClient()
  const [paciente, odontograma, historial, receta] = await Promise.all([
    supabase.from('patients').select('*').eq('id', patientId).single(),
    supabase.from('odontogramas').select('denticion, estado').eq('patient_id', patientId)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle(),
    cargarConsultas(supabase, patientId),
    supabase.from('prescriptions').select('id, created_at, medicines, notes').eq('patient_id', patientId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (!paciente.data) notFound()
  if (odontograma.error || receta.error) {
    throw new Error('No se pudo cargar el historial del paciente.')
  }

  const estado = validarEstado(odontograma.data?.estado ?? estadoVacio())
  if (!estado.ok) throw new Error('El odontograma guardado del paciente no es válido.')

  const cita = typeof appointmentId === 'string' ? appointmentId || null : null

  return (
    <NuevaConsultaDentalClient
      key={`${patientId}:${cita ?? ''}`}
      paciente={paciente.data}
      appointmentId={cita}
      consultas={historial}
      ultimaReceta={receta.data ?? undefined}
      currentUserId={ctx.user.id}
      denticionInicial={(odontograma.data?.denticion as Denticion | undefined) ?? denticionPorEdad(paciente.data.birth_date ?? null)}
      estadoInicial={estado.estado}
    />
  )
}
