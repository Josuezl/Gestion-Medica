/**
 * Migración de la 2ª clínica de Manuel (CNA) → Supabase, con deduplicación.
 *
 * Los pacientes/consultas de "BD Manuel 2" se incorporan al MISMO tenant de
 * Manuel. Si un paciente de CNA ya existe (mismo nombre + misma fecha de
 * nacimiento), sus consultas se agregan a ese expediente; si no, se crea.
 * Las consultas llevan motivo "Migrados de CNA".
 *
 * Uso:
 *   node migrate-cna.mjs            # dry-run: solo reporte, no toca la BD
 *   node migrate-cna.mjs --execute  # inserta (upsert idempotente)
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

// Mismas constantes que la 1ª migración (NO cambiar el namespace).
const NAMESPACE = '8f1d6f3a-2b4c-4e5d-9a7b-0c1d2e3f4a5b';
const MDB_PASSWORD = 'VB6 CP26';
const CLINIC_ID = '6da8729c-65f8-43b5-afcb-842fa15e7663';
const MANUEL_ID = '55aa8901-7cc3-4012-9d65-70cc1882a025';
const MDB_PATH = join(ROOT, 'Migracion ', 'BD Manuel 2', 'Consulta', 'CONSULV4.MDB');

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

// ---------- helpers de transformación (copiados de migrate.mjs) ----------

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

/** Normaliza un nombre para comparación de duplicados. */
function normName(s) {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- carga de pacientes existentes (para deduplicar) ----------

async function fetchExistingPatients(env) {
  const all = [];
  let offset = 0;
  for (;;) {
    const res = await fetch(
      `${env.url}/rest/v1/patients?clinic_id=eq.${CLINIC_ID}&select=id,first_name,last_name,birth_date&order=id&limit=1000&offset=${offset}`,
      { headers: { apikey: env.key, Authorization: `Bearer ${env.key}` } }
    );
    if (!res.ok) throw new Error(`fetch patients: ${res.status} ${await res.text()}`);
    const page = await res.json();
    all.push(...page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  return all;
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

const env = loadEnv();

// 1. Leer CNA
const reader = new MDBReader(readFileSync(MDB_PATH), { password: MDB_PASSWORD });
const pacRows = reader.getTable('Identificacion').getData();
const hisRows = reader.getTable('Historias').getData();

const cnaPatientUuid = (idPac) => uuidv5(`cna:pac:${idPac}`, NAMESPACE);

// 2. Cargar pacientes existentes, EXCLUYENDO los que ya provienen de CNA
//    (para que la re-ejecución sea idempotente y los homónimos internos de CNA
//    no se emparejen entre sí).
const cnaIds = new Set(pacRows.map((r) => cnaPatientUuid(r.IDPac)));
const existing = (await fetchExistingPatients(env)).filter((p) => !cnaIds.has(p.id));

// Índice nombre normalizado -> lista de { id, birth_date }
const indexByName = new Map();
for (const p of existing) {
  const key = normName(`${p.first_name} ${p.last_name}`);
  if (!indexByName.has(key)) indexByName.set(key, []);
  indexByName.get(key).push({ id: p.id, birth_date: p.birth_date });
}

// 3. Resolver identidad de cada paciente CNA (dedup por nombre + fecha)
const stats = {
  cna_pacientes: pacRows.length,
  cna_consultas: hisRows.length,
  reusados: 0,
  nuevos: 0,
  birth_placeholder: 0,
  phone_placeholder: 0,
  phone_doble: 0,
  phone_sin_normalizar: 0,
  gender_null: 0,
  diagnostico_placeholder: 0,
  tratamiento_placeholder: 0,
  nota_desde_rtf: 0,
  hora_invalida: 0,
};

const mapping = new Map(); // IDPac CNA -> patient uuid
const newPatientsRows = []; // los que hay que crear
const firstVisit = new Map(); // patient uuid -> menor created_at

// Consultas primero (para conocer la primera consulta de cada paciente)
const consultations = [];
for (const r of hisRows) {
  // resolver patient_id (con caché en mapping)
  let pid = mapping.get(r.IDPac);
  if (!pid) {
    const src = pacRows.find((p) => p.IDPac === r.IDPac);
    pid = resolvePatientId(src);
    mapping.set(r.IDPac, pid);
  }

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

  if (!firstVisit.has(pid) || createdAt < firstVisit.get(pid)) firstVisit.set(pid, createdAt);

  consultations.push({
    id: uuidv5(`cna:his:${r.IDHistoria}`, NAMESPACE),
    clinic_id: CLINIC_ID,
    patient_id: pid,
    doctor_id: MANUEL_ID,
    reason_for_visit: 'Migrados de CNA',
    symptoms: nota || null,
    diagnosis,
    treatment_plan: treatment,
    created_at: createdAt,
  });
}

// Asegurar mapping para pacientes sin consultas (raro, pero por completitud)
for (const r of pacRows) {
  if (!mapping.has(r.IDPac)) mapping.set(r.IDPac, resolvePatientId(r));
}

// Completar created_at de los pacientes nuevos con su primera consulta
for (const row of newPatientsRows) {
  row.created_at = firstVisit.get(row.id) ?? new Date().toISOString();
}

/**
 * Devuelve el patient_id para un registro de Identificacion de CNA.
 * Si coincide (nombre normalizado + fecha de nacimiento) con un paciente
 * existente, reusa su id. Si no, genera un nuevo paciente determinístico.
 */
function resolvePatientId(src) {
  const { first_name, last_name } = splitName(src.Nombre);
  const birth = toDateString(src.BirthDate);
  const key = normName(`${first_name} ${last_name}`);

  if (birth) {
    const candidates = indexByName.get(key);
    if (candidates) {
      const hit = candidates.find((c) => c.birth_date === birth);
      if (hit) {
        stats.reusados++;
        return hit.id; // expediente existente, no se crea paciente
      }
    }
  }

  // Paciente nuevo
  stats.nuevos++;
  const id = cnaPatientUuid(src.IDPac);
  const sexo = clean(src.Sexo).toUpperCase();
  const gender = sexo === 'M' || sexo === 'F' ? sexo : null;
  if (!gender) stats.gender_null++;
  let birthDate = birth;
  if (!birthDate) {
    birthDate = '1900-01-01';
    stats.birth_placeholder++;
  }
  const emailPac = clean(src.Email);
  const extras = [];
  if (clean(src.Aseguradora)) extras.push(`Aseguradora: ${clean(src.Aseguradora)}`);
  if (clean(src.EdoCivil)) extras.push(`Estado civil: ${clean(src.EdoCivil)}`);
  if (clean(src.Observaciones)) extras.push(`Observaciones (migración): ${clean(src.Observaciones)}`);

  newPatientsRows.push({
    id,
    clinic_id: CLINIC_ID,
    first_name,
    last_name,
    id_card: truncate(clean(src.NumID), 100) || null,
    gender,
    birth_date: birthDate,
    phone: normalizePhone(src.Tel, stats),
    email: EMAIL_RE.test(emailPac) ? truncate(emailPac, 255) : null,
    address: clean(src.Domicilio) || null,
    non_pathological_history: extras.length ? extras.join('. ') : null,
    created_at: new Date().toISOString(), // se sobreescribe con la primera consulta
  });

  // agregar el nuevo al índice evita crear dos pacientes para el mismo
  // nombre+fecha repetido dentro de CNA (homónimo interno real)
  if (!indexByName.has(key)) indexByName.set(key, []);
  indexByName.get(key).push({ id, birth_date: birthDate });

  return id;
}

// ---------- reporte ----------

console.log(`Modo: ${EXECUTE ? 'EXECUTE (inserta en Supabase)' : 'DRY-RUN (solo reporte)'}\n`);
console.log('── CNA (BD Manuel 2) → tenant de Manuel');
console.log(`   pacientes en CNA:        ${stats.cna_pacientes}`);
console.log(`   → reusados (ya existían): ${stats.reusados}`);
console.log(`   → nuevos a crear:         ${stats.nuevos}`);
console.log(`   consultas a migrar:       ${consultations.length}`);
console.log(`   ajustes: ${JSON.stringify(stats, null, 2).replace(/\n/g, '\n   ')}`);

if (EXECUTE) {
  console.log('\nInsertando (upsert idempotente)...');
  if (newPatientsRows.length) await upsertBatches(env, 'patients', newPatientsRows);
  await upsertBatches(env, 'consultations', consultations);
  console.log('\nMigración CNA completada. Ejecuta verify-cna.mjs para validar.');
} else {
  console.log('\nDry-run: no se tocó la base de datos. Usa --execute para migrar.');
}
