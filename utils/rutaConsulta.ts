export function rutaNuevaConsulta(patientId: string, appointmentId: string | null, esOdontologo: boolean): string {
  const ruta = esOdontologo ? '/dashboard/odontologia/consulta/nueva' : '/dashboard/consultations/new'
  const params = new URLSearchParams({ patientId })
  if (appointmentId !== null) params.set('appointmentId', appointmentId)
  return `${ruta}?${params}`
}
