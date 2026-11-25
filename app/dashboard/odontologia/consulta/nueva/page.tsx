import { notFound, redirect } from 'next/navigation'
import { getSessionProfile } from '@/utils/session'
import { createClient } from '@/utils/supabase/server'
import { denticionPorEdad, estadoVacio, realizadosNuevos, trabajosPendientes, validarEstado, type Denticion } from '@/utils/odontograma'
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

async function cargarOdontogramas(supabase: Awaited<ReturnType<typeof createClient>>, patientId: string) {
  // Un paciente tiene un odontograma por consulta dental: unas decenas en la vida del expediente.
  const { data, error } = await supabase.from('odontogramas')
    .select('consultation_id, created_at, denticion, estado')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false })
  if (error) throw new Error('No se pudo cargar el historial de odontogramas.')

  return data.map((fila) => {
    const resultado = validarEstado(fila.estado)
    if (!resultado.ok) throw new Error('Un odontograma guardado del paciente no es válido.')
    return { ...fila, denticion: fila.denticion as Denticion, estado: resultado.estado }
  })
}

export default async function NuevaConsultaDentalPage({ searchParams }: PageProps) {
  const { patientId, appointmentId } = await searchParams
  if (typeof patientId !== 'string' || !patientId) redirect('/dashboard/patients')

  const session = await getSessionProfile()
  if (!session?.profile?.odontologia_habilitada || !session.profile.is_dentist) {
    redirect(`/dashboard/patients/${encodeURIComponent(patientId)}`)
  }

  const supabase = await createClient()
  const [paciente, odontogramas, historial, receta] = await Promise.all([
    supabase.from('patients').select('*').eq('id', patientId).single(),
    cargarOdontogramas(supabase, patientId),
    cargarConsultas(supabase, patientId),
    supabase.from('prescriptions').select('id, created_at, medicines, notes').eq('patient_id', patientId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (!paciente.data) notFound()
  if (receta.error) {
    throw new Error('No se pudo cargar el historial del paciente.')
  }

  const ultimo = odontogramas[0]
  const denticion = ultimo?.denticion ?? denticionPorEdad(paciente.data.birth_date ?? null)
  const estado = ultimo?.estado ?? estadoVacio()
  const porConsulta = new Map(odontogramas.map((actual, indice) => {
    const previo = odontogramas[indice + 1]
    const anterior = actual.created_at && previo?.created_at ? previo.estado : null
    return [actual.consultation_id, {
      denticion: actual.denticion,
      trabajos: realizadosNuevos(actual.estado, anterior),
    }] as const
  }))
  const trabajosPrevios = historial.filter(({ tipo }) => tipo === 'DENTAL').map((consulta) => ({
    id: consulta.id,
    fecha: consulta.created_at,
    odontologo: consulta.user_profiles,
    procedimientos: consulta.procedures_done?.trim() || null,
    denticion: porConsulta.get(consulta.id)?.denticion ?? denticion,
    trabajos: porConsulta.get(consulta.id)?.trabajos ?? [],
  }))

  const cita = typeof appointmentId === 'string' ? appointmentId || null : null

  return (
    <NuevaConsultaDentalClient
      key={`${patientId}:${cita ?? ''}`}
      paciente={paciente.data}
      appointmentId={cita}
      consultas={historial}
      ultimaReceta={receta.data ?? undefined}
      currentUserId={session.user.id}
      denticionInicial={denticion}
      estadoInicial={estado}
      pendientes={trabajosPendientes(estado)}
      trabajosPrevios={trabajosPrevios}
    />
  )
}
