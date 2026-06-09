import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()

  // 1. Get current user's clinic_id
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) {
    return NextResponse.json({ error: 'User not associated with a clinic' }, { status: 400 })
  }

  const clinic_id = profile.clinic_id

  const firstNames = ['Juan', 'Pedro', 'Maria', 'Ana', 'Luis', 'Carlos', 'Sofia', 'Lucia', 'Jorge', 'Elena', 'Diego', 'Carmen', 'Jose', 'Rosa', 'Miguel', 'Laura', 'Bessy', 'Josue', 'Valeria', 'Daniel', 'Gabriel', 'Valentina', 'Andrea', 'Ricardo', 'Fernando']
  const lastNames = ['Perez', 'Gomez', 'Lopez', 'Garcia', 'Martinez', 'Rodriguez', 'Fernandez', 'Ruiz', 'Diaz', 'Alvarez', 'Cruz', 'Andino', 'Zuniga', 'Morales', 'Mendoza', 'Castro', 'Ortiz', 'Ramos', 'Flores', 'Vargas']
  const genders = ['M', 'F', 'O']
  
  const patients = []
  for(let i=0; i<100; i++) {
    const fn = firstNames[Math.floor(Math.random()*firstNames.length)]
    const ln = lastNames[Math.floor(Math.random()*lastNames.length)]
    const gn = genders[Math.floor(Math.random()*genders.length)]
    const y = 1950 + Math.floor(Math.random() * 50)
    const m = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')
    const d = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')
    
    // random 8 digit phone in Honduras format
    const phone = '+504' + (80000000 + Math.floor(Math.random() * 19999999)).toString()
    
    patients.push({
      clinic_id,
      first_name: fn,
      last_name: ln + ' ' + lastNames[Math.floor(Math.random()*lastNames.length)],
      gender: gn,
      birth_date: `${y}-${m}-${d}`,
      phone: phone,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@test.com`,
      address: 'Dirección de prueba ' + i,
      blood_type: 'O+',
      allergies: 'Ninguna'
    })
  }

  const { error } = await supabase.from('patients').insert(patients)
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, count: patients.length, message: '100 test patients inserted successfully!' })
}
