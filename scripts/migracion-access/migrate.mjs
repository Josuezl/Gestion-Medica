/**
 * Migración de expedientes históricos Access (CONSULV4.MDB) → Supabase.
 *
 * Uso:
 *   node migrate.mjs            # dry-run: solo reporte, no toca la BD
 *   node migrate.mjs --execute  # inserta (upsert idempotente por id determinístico)
 *
 * No imprime datos de pacientes: solo conteos y reportes agregados.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import MDBReader from 'mdb-reader';
import { v5 as uuidv5 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// Constante fija: NO cambiar nunca, o la re-ejecución duplicaría registros.
const NAMESPACE = '8f1d6f3a-2b4c-4e5d-9a7b-0c1d2e3f4a5b';
const MDB_PASSWORD = 'VB6 CP26';
const CLINIC_ID = '6da8729c-65f8-43b5-afcb-842fa15e7663';
// La carpeta "Migracion " lleva un espacio al final (así llegó del respaldo).
const MIGRACION_DIR = join(ROOT, 'Migracion ');

const DOCTORS = [
  {
    email: 'carolzunigagarcia.1322@gmail.com',
    doctorId: 'c0c88482-181e-4cf2-b4d5-9112274a5485',
    mdb: join(MIGRACION_DIR, 'carolzunigagarcia.1322@gmail.com', 'Consulta', 'CONSULV4.MDB'),
  },
  {
    email: 'manueler18@gmail.com',
    doctorId: '55aa8901-7cc3-4012-9d65-70cc1882a025',
    mdb: join(MIGRACION_DIR, 'manueler18@gmail.com', 'Consulta', 'CONSULV4.MDB'),
  },
];

const EXECUTE = process.argv.includes('--execute');

// ---------- entorno ----------

function loadEnv() {
  const env = readFileSync(join(ROOT, '.env.local'), 'utf8');
  const get = (k) =>
    env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '');
  const url = get('NEXT_PUBLIC_SUPABASE_URL');
  const key = get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  return { url, key };
}

// ---------- helpers de transformación ----------

const clean = (v) => (v == null ? '' : String(v).trim());
const truncate = (s, n) => (s.length > n ? s.slice(0, n) : s);

/** Fecha de un Date de mdb-reader (almacenada sin zona horaria) → 'YYYY-MM-DD'. */
function toDateString(d) {
  if (!(d instanceof Date) || isNaN(d)) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** "Apellidos, Nombres" o palabras sueltas → { first_name, last_name }. */
function splitName(nombre) {
  const full = clean(nombre).replace(/\s+/g, ' ');
  if (full.includes(',')) {
    const [last, first] = full.split(',', 2).map((s) => s.trim());
    return {
      first_name: truncate(first || '(sin nombre)', 100),
      last_name: truncate(last || '(sin apellido)', 100),
    };
  }
  const words = full.split(' ').filter(Boolean);
  let first, last;
  if (words.length >= 4) {
    first = words.slice(0, -2).join(' ');
    last = words.slice(-2).join(' ');
  } else if (words.length === 3) {
    first = words[0];
    last = words.slice(1).join(' ');
  } else if (words.length === 2) {
    [first, last] = words;
  } else {
    first = words[0] || '(sin nombre)';
    last = '(sin apellido)';
  }
  return { first_name: truncate(first, 100), last_name: truncate(last, 100) };
}

function normalizePhone(tel, stats) {
  const raw = clean(tel);
  if (!raw) {
    stats.phone_placeholder++;
    return 'No registrado';
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) return `+504${digits}`;
  if (digits.length === 16) {
    stats.phone_doble++;
    return `+504${digits.slice(0, 8)}`;
  }
  stats.phone_sin_normalizar++;
  return truncate(raw, 50);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Quita formato RTF dejando texto plano legible (respaldo para HistoriaT vacía). */
function stripRtf(rtf) {
  let s = String(rtf ?? '');
  if (!s.trimStart().startsWith('{\\rtf')) return s.trim();
  // Destinos a descartar por completo (tablas de fuentes/colores, info, etc.)
  s = s.replace(/\{\\\*?\\?(?:fonttbl|colortbl|stylesheet|info|generator)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '');
  s = s.replace(/\\par[d]?\b/g, '\n');
  s = s.replace(/\\line\b/g, '\n');
  s = s.replace(/\\tab\b/g, '\t');
  s = s.replace(/\\'([0-9a-fA-F]{2})/g, (_, h) => {
    try {
      return Buffer.from([parseInt(h, 16)]).toString('latin1');
    } catch {
      return '';
    }
  });
  s = s.replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode(((+n % 65536) + 65536) % 65536));
  s = s.replace(/\\[a-zA-Z]+-?\d*\s?/g, '');
  s = s.replace(/[{}]/g, '');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- transformación por doctor ----------

function transformDoctor({ email, doctorId, mdb }) {
  const reader = new MDBReader(readFileSync(mdb), { password: MDB_PASSWORD });
  const pacRows = reader.getTable('Identificacion').getData();
  const hisRows = reader.getTable('Historias').getData();

  const stats = {
    pacientes: pacRows.length,
    consultas: hisRows.length,
    birth_placeholder: 0,
    phone_placeholder: 0,
    phone_doble: 0,
    phone_sin_normalizar: 0,
    gender_null: 0,
    nombre_coma: 0,
    extras_en_historia_no_patologica: 0,
    diagnostico_placeholder: 0,
    tratamiento_placeholder: 0,
    nota_desde_rtf: 0,
    hora_invalida: 0,
  };

  const patientUuid = (idPac) => uuidv5(`${email}:pac:${idPac}`, NAMESPACE);

  // --- Consultas primero, para conocer la primera consulta de cada paciente ---
  const consultations = [];
  const firstVisit = new Map(); // patient uuid -> menor created_at
  for (const r of hisRows) {
    const dateStr = toDateString(r.FechaDeLaHistoria);
    let hora = clean(r.HoraDeLaHistoria);
    if (!/^\d{1,2}:\d{2}$/.test(hora)) {
      stats.hora_invalida++;
      hora = '12:00';
    }
    const [hh, mm] = hora.split(':');
    const createdAt = `${dateStr}T${hh.padStart(2, '0')}:${mm}:00-06:00`;

    let nota = clean(r.HistoriaT);
    if (!nota) {
      nota = stripRtf(r.Historia);
      stats.nota_desde_rtf++;
    }
    let diagnosis = clean(r.Diagnostico);
    if (!diagnosis) {
      diagnosis = 'No registrado (migración)';
      stats.diagnostico_placeholder++;
    }
    let treatment = clean(r.Tratamiento);
    if (!treatment) {
      treatment = 'No registrado (migración)';
      stats.tratamiento_placeholder++;
    }

    const pid = patientUuid(r.IDPac);
    if (!firstVisit.has(pid) || createdAt < firstVisit.get(pid)) firstVisit.set(pid, createdAt);

    consultations.push({
      id: uuidv5(`${email}:his:${r.IDHistoria}`, NAMESPACE),
      clinic_id: CLINIC_ID,
      patient_id: pid,
      doctor_id: doctorId,
      reason_for_visit: 'Consulta histórica (migrada de Access)',
      symptoms: nota || null,
      diagnosis,
      treatment_plan: treatment,
      created_at: createdAt,
    });
  }

  // --- Pacientes ---
  const patients = [];
  for (const r of pacRows) {
    if (clean(r.Nombre).includes(',')) stats.nombre_coma++;
    const { first_name, last_name } = splitName(r.Nombre);

    let birth = toDateString(r.BirthDate);
    if (!birth) {
      birth = '1900-01-01';
      stats.birth_placeholder++;
    }

    const sexo = clean(r.Sexo).toUpperCase();
    const gender = sexo === 'M' || sexo === 'F' ? sexo : null;
    if (!gender) stats.gender_null++;

    const emailPac = clean(r.Email);
    const extras = [];
    if (clean(r.Aseguradora)) extras.push(`Aseguradora: ${clean(r.Aseguradora)}`);
    if (clean(r.EdoCivil)) extras.push(`Estado civil: ${clean(r.EdoCivil)}`);
    if (clean(r.Observaciones)) extras.push(`Observaciones (migración): ${clean(r.Observaciones)}`);
    if (extras.length) stats.extras_en_historia_no_patologica++;

    const pid = patientUuid(r.IDPac);
    patients.push({
      id: pid,
      clinic_id: CLINIC_ID,
      first_name,
      last_name,
      id_card: truncate(clean(r.NumID), 100) || null,
      gender,
      birth_date: birth,
      phone: normalizePhone(r.Tel, stats),
      email: EMAIL_RE.test(emailPac) ? truncate(emailPac, 255) : null,
      address: clean(r.Domicilio) || null,
      non_pathological_history: extras.length ? extras.join('. ') : null,
      created_at: firstVisit.get(pid) ?? new Date().toISOString(),
    });
  }

  return { email, patients, consultations, stats };
}

// ---------- carga a Supabase ----------

async function upsertBatches(env, table, rows, batchSize = 500) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(`${env.url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      throw new Error(`Upsert ${table} lote ${i / batchSize + 1}: ${res.status} ${await res.text()}`);
    }
    process.stdout.write(`  ${table}: ${Math.min(i + batchSize, rows.length)}/${rows.length}\r`);
  }
  console.log(`  ${table}: ${rows.length}/${rows.length} ✓`);
}

// ---------- main ----------

const results = DOCTORS.map(transformDoctor);

console.log(`Modo: ${EXECUTE ? 'EXECUTE (inserta en Supabase)' : 'DRY-RUN (solo reporte)'}\n`);
for (const r of results) {
  console.log(`── ${r.email}`);
  console.log(`   pacientes a migrar:  ${r.patients.length}`);
  console.log(`   consultas a migrar:  ${r.consultations.length}`);
  console.log(`   placeholders/ajustes: ${JSON.stringify(r.stats, null, 2).replace(/\n/g, '\n   ')}`);
}

const allPatients = results.flatMap((r) => r.patients);
const allConsultations = results.flatMap((r) => r.consultations);
console.log(`\nTOTAL: ${allPatients.length} pacientes, ${allConsultations.length} consultas`);

if (EXECUTE) {
  const env = loadEnv();
  console.log('\nInsertando (upsert idempotente)...');
  await upsertBatches(env, 'patients', allPatients);
  await upsertBatches(env, 'consultations', allConsultations);
  console.log('\nMigración completada. Ejecuta verify.mjs para validar.');
} else {
  console.log('\nDry-run: no se tocó la base de datos. Usa --execute para migrar.');
}
