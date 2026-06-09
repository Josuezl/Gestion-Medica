const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('Fetching clinics...');
  const { data: clinics, error: errClinics } = await supabase.from('clinics').select('id').limit(1);
  if (errClinics || !clinics.length) {
    console.error('No clinics found or error:', errClinics);
    return;
  }
  const clinic_id = clinics[0].id;
  console.log('Using clinic_id:', clinic_id);

  const firstNames = ['Juan', 'Pedro', 'Maria', 'Ana', 'Luis', 'Carlos', 'Sofia', 'Lucia', 'Jorge', 'Elena', 'Diego', 'Carmen', 'Jose', 'Rosa', 'Miguel', 'Laura', 'Bessy', 'Josue'];
  const lastNames = ['Perez', 'Gomez', 'Lopez', 'Garcia', 'Martinez', 'Rodriguez', 'Fernandez', 'Ruiz', 'Diaz', 'Alvarez', 'Cruz', 'Andino', 'Zuniga'];
  const genders = ['M', 'F', 'O'];
  
  const patients = [];
  for(let i=0; i<100; i++) {
    const fn = firstNames[Math.floor(Math.random()*firstNames.length)];
    const ln = lastNames[Math.floor(Math.random()*lastNames.length)];
    const gn = genders[Math.floor(Math.random()*genders.length)];
    const y = 1950 + Math.floor(Math.random() * 50);
    const m = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
    const d = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
    
    // random 8 digit phone
    const phone = '+504' + (80000000 + Math.floor(Math.random() * 19999999)).toString();
    
    patients.push({
      clinic_id,
      first_name: fn,
      last_name: ln + ' ' + lastNames[Math.floor(Math.random()*lastNames.length)],
      gender: gn,
      birth_date: `${y}-${m}-${d}`,
      phone: phone,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@test.com`,
      address: 'Direccion de prueba ' + i,
      blood_type: 'O+',
      allergies: 'Ninguna'
    });
  }

  console.log(`Inserting ${patients.length} patients...`);
  const { data, error } = await supabase.from('patients').insert(patients);
  if (error) {
    console.error('Error inserting:', error);
  } else {
    console.log('Successfully inserted 100 fake patients!');
  }
}

seed();
