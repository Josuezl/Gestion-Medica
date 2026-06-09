'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function setSessionLocation(locationId: string) {
  // Guardamos el ID de la clínica en una cookie que expira en 30 días
  const cookieStore = await cookies()
  cookieStore.set('current_location_id', locationId, {
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  })

  redirect('/dashboard')
}
