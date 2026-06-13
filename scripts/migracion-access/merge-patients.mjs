/**
 * Fusiona dos expedientes de paciente en uno solo (para limpiar duplicados que
 * la deduplicación automática no detectó por diferencias en el nombre).
 *
 * Reasigna todas las consultas/recetas/estudios/citas del paciente a ELIMINAR
 * hacia el paciente a CONSERVAR, completa los campos vacíos del que se conserva
 * y luego borra el duplicado.
 *
 * Uso:
 *   node merge-patients.mjs <idConservar> <idEliminar>            # dry-run
 *   node merge-patients.mjs <idConservar> <idEliminar> --execute  # fusiona
 *
 * Acepta el id completo o un prefijo (el id corto que muestra la app, ej. 167dd143).
 * No imprime datos clínicos; solo nombres y conteos para confirmar.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const CHILD_TABLES = ['consultations', 'studies', 'prescriptions', 'appointments'];

function loadEnv() {
  const env = readFileSync(join(ROOT, '.env.local'), 'utf8');
  const get = (k) =>
    env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '');
  const url = get('NEXT_PUBLIC_SUPABASE_URL');
  const key = get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  return { url, key };
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const EXECUTE = process.argv.includes('--execute');
if (args.length !== 2) {
  console.error('Uso: node merge-patients.mjs <idConservar> <idEliminar> [--execute]');
  process.exit(1);
}
const [keepArg, mergeArg] = args;

const env = loadEnv();
const H = { apikey: env.key, Authorization: `Bearer ${env.key}` };

async function rest(path) {
  const res = await fetch(`${env.url}/rest/v1/${path}`, { headers: H });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function countChild(table, patientId) {
  const res = await fetch(`${env.url}/rest/v1/${table}?patient_id=eq.${patientId}&select=id`, {
    method: 'HEAD',
    headers: { ...H, Prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`count ${table}: ${res.status}`);
  return Number(res.headers.get('content-range').split('/')[1]);
}

const FULL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATIENT_COLS =
  'id,clinic_id,first_name,last_name,birth_date,gender,phone,id_card,address,email,blood_type,allergies,family_history,pathological_history,non_pathological_history,is_pediatric,father_name,mother_name,created_at';

/** Todos los ids de pacientes (PostgREST no permite LIKE sobre columnas uuid). */
async function allPatientIds() {
  const ids = [];
  let offset = 0;
  for (;;) {
    const page = await rest(`patients?select=id&order=id&limit=1000&offset=${offset}`);
    ids.push(...page.map((p) => p.id));
    if (page.length < 1000) break;
    offset += 1000;
  }
  return ids;
}

/** Resuelve un id completo o un prefijo (contra `allIds`) a un único paciente. */
async function resolvePatient(arg, allIds) {
  let fullId;
  if (FULL_UUID.test(arg)) {
    fullId = arg.toLowerCase();
  } else {
    const pref = arg.toLowerCase();
    const matches = allIds.filter((id) => id.startsWith(pref));
    if (matches.length === 0) throw new Error(`No se encontró ningún paciente con "${arg}".`);
    if (matches.length > 1) throw new Error(`"${arg}" es ambiguo: coincide con ${matches.length} pacientes. Usa más caracteres.`);
    fullId = matches[0];
  }
  const rows = await rest(`patients?id=eq.${fullId}&select=${PATIENT_COLS}`);
  if (rows.length === 0) throw new Error(`No se encontró ningún paciente con "${arg}".`);
  return rows[0];
}

// ---------- main ----------

const allIds = await allPatientIds();
const keep = await resolvePatient(keepArg, allIds);

let merge;
try {
  merge = await resolvePatient(mergeArg, allIds);
} catch (e) {
  // Idempotencia: si el duplicado ya no existe, probablemente ya se fusionó.
  console.log(`El paciente a eliminar ("${mergeArg}") no existe. ¿Ya se fusionó? Nada que hacer.`);
  process.exit(0);
}

const fullName = (p) => `${p.first_name} ${p.last_name}`;

if (keep.id === merge.id) {
  throw new Error('El id a conservar y el id a eliminar son el mismo paciente.');
}
if (keep.clinic_id !== merge.clinic_id) {
  throw new Error('Los dos pacientes pertenecen a clínicas distintas. No se fusionan entre tenants.');
}

// Conteos de hijos
const childCounts = {};
for (const t of CHILD_TABLES) {
  childCounts[t] = { keep: await countChild(t, keep.id), merge: await countChild(t, merge.id) };
}

// Campos a rellenar en el principal (solo si están vacíos)
const isEmpty = (v) => v == null || String(v).trim() === '';
const patch = {};
const fillIfEmpty = (field) => {
  if (isEmpty(keep[field]) && !isEmpty(merge[field])) patch[field] = merge[field];
};
for (const f of ['address', 'gender', 'id_card', 'email', 'blood_type', 'father_name', 'mother_name',
  'pathological_history', 'non_pathological_history', 'family_history']) {
  fillIfEmpty(f);
}
if (keep.phone === 'No registrado' && merge.phone && merge.phone !== 'No registrado') patch.phone = merge.phone;
if (keep.birth_date === '1900-01-01' && merge.birth_date && merge.birth_date !== '1900-01-01') patch.birth_date = merge.birth_date;
if (keep.allergies === 'Ninguna conocida' && !isEmpty(merge.allergies) && merge.allergies !== 'Ninguna conocida') patch.allergies = merge.allergies;
if (!keep.is_pediatric && merge.is_pediatric) patch.is_pediatric = true;
const oldestCreated = [keep.created_at, merge.created_at].sort()[0];
if (oldestCreated !== keep.created_at) patch.created_at = oldestCreated;

// Reporte
console.log(`Modo: ${EXECUTE ? 'EXECUTE (modifica la BD)' : 'DRY-RUN (solo reporte)'}\n`);
console.log(`CONSERVAR: ${fullName(keep)}  (${keep.id})`);
console.log(`ELIMINAR:  ${fullName(merge)}  (${merge.id})`);
console.log('\nReasignación de registros del duplicado → principal:');
for (const t of CHILD_TABLES) {
  console.log(`  ${t}: ${childCounts[t].merge} a reasignar  (el principal ya tiene ${childCounts[t].keep})`);
}
console.log('\nCampos del principal a completar con datos del duplicado:');
console.log(Object.keys(patch).length ? `  ${JSON.stringify(patch)}` : '  (ninguno)');

if (!EXECUTE) {
  console.log('\nDry-run: no se tocó la base de datos. Agrega --execute para fusionar.');
  process.exit(0);
}

// ---------- ejecución ----------

async function reqOk(method, path, body) {
  const res = await fetch(`${env.url}/rest/v1/${path}`, {
    method,
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
}

console.log('\nFusionando...');

// a. Reasignar hijos
for (const t of CHILD_TABLES) {
  if (childCounts[t].merge > 0) {
    await reqOk('PATCH', `${t}?patient_id=eq.${merge.id}`, { patient_id: keep.id });
    console.log(`  ${t}: ${childCounts[t].merge} reasignadas ✓`);
  }
}

// b. Enriquecer el principal
if (Object.keys(patch).length) {
  await reqOk('PATCH', `patients?id=eq.${keep.id}`, patch);
  console.log('  principal enriquecido ✓');
}

// c. Salvaguarda: el duplicado debe quedar sin hijos
const remaining = {};
for (const t of CHILD_TABLES) remaining[t] = await countChild(t, merge.id);
const totalRemaining = Object.values(remaining).reduce((a, b) => a + b, 0);
if (totalRemaining > 0) {
  throw new Error(`ABORTADO antes de borrar: el duplicado aún tiene hijos ${JSON.stringify(remaining)}.`);
}

// d. Borrar el duplicado
await reqOk('DELETE', `patients?id=eq.${merge.id}`);
console.log(`  duplicado eliminado ✓`);

const totalKeep = CHILD_TABLES.reduce((a, t) => a + childCounts[t].keep + childCounts[t].merge, 0);
console.log(`\nFusión completada. ${fullName(keep)} ahora tiene ${totalKeep} registros asociados (consultas+recetas+estudios+citas).`);
