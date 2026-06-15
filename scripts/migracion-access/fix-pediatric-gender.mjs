/**
 * Corrige el género (M/F) de los pacientes PEDIÁTRICOS del tenant Centro Neurológico que
 * quedaron sin género ("Otro"/null) tras la migración, infiriéndolo del nombre de pila.
 * Los nombres unisex/ambiguos (p. ej. "Jose Maria") se OMITEN para revisión manual.
 *
 * Uso:
 *   node fix-pediatric-gender.mjs --dump-names   # vuelca los nombres de pila a un archivo local
 *   node fix-pediatric-gender.mjs                # dry-run: solo conteos, no toca la BD
 *   node fix-pediatric-gender.mjs --execute      # aplica los cambios
 *
 * La clasificación M/F vive en gender-map.local.json: { "M": [...tokens...], "F": [...tokens...] }.
 * Solo afecta a: clinic_id = tenant, is_pediatric = true y gender en null/'O'. Idempotente.
 * No imprime datos sensibles a consola (solo conteos); los nombres van a archivos *.local.* (gitignored).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const TENANT = '6da8729c-65f8-43b5-afcb-842fa15e7663'; // Centro Neurológico y Cardiovascular

const MODE = process.argv.includes('--dump-names')
  ? 'dump'
  : process.argv.includes('--execute')
    ? 'execute'
    : 'dry';

function loadEnv() {
  const env = readFileSync(join(ROOT, '.env.local'), 'utf8');
  const get = (k) =>
    env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '');
  const url = get('NEXT_PUBLIC_SUPABASE_URL');
  const key = get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  return { url, key };
}

const env = loadEnv();
const H = { apikey: env.key, Authorization: `Bearer ${env.key}` };

async function rest(path) {
  const res = await fetch(`${env.url}/rest/v1/${path}`, { headers: H });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}
async function reqOk(method, path, body) {
  const res = await fetch(`${env.url}/rest/v1/${path}`, {
    method,
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
}

const norm = (s) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const tokensOf = (first) => (first ?? '').trim().split(/\s+/).map(norm).filter(Boolean);

// Pacientes objetivo: pediátricos del tenant con género en null/'O'.
async function loadTargets() {
  const out = [];
  let offset = 0;
  for (;;) {
    const page = await rest(
      `patients?clinic_id=eq.${TENANT}&is_pediatric=eq.true&or=(gender.is.null,gender.eq.O)` +
        `&select=id,first_name&order=id&limit=1000&offset=${offset}`,
    );
    out.push(...page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  return out;
}

const targets = await loadTargets();

// --- Modo dump: volcar nombres de pila distintos (para clasificarlos) ---
if (MODE === 'dump') {
  const counts = new Map();
  for (const p of targets) {
    const name = (p.first_name ?? '').trim();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const lines = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([n, c]) => `${String(c).padStart(4)}  ${n}`);
  const file = join(__dirname, 'gender-firstnames.local.txt');
  writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  console.log(`Pacientes objetivo: ${targets.length}. Nombres de pila distintos: ${counts.size}.`);
  console.log(`Escrito: ${file}`);
  process.exit(0);
}

// --- Clasificación M/F ---
const mapFile = join(__dirname, 'gender-map.local.json');
if (!existsSync(mapFile)) {
  console.error(`Falta ${mapFile}. Corre primero --dump-names y crea el mapa de clasificación { "M": [...], "F": [...] }.`);
  process.exit(1);
}
const map = JSON.parse(readFileSync(mapFile, 'utf8'));
const MALE = new Set((map.M || []).map(norm));
const FEMALE = new Set((map.F || []).map(norm));

/** Devuelve 'M' | 'F' | null (null = unisex/ambiguo/desconocido → omitir). */
function classify(first) {
  const ts = tokensOf(first);
  const male = ts.some((t) => MALE.has(t));
  const female = ts.some((t) => FEMALE.has(t));
  if (male && female) return null; // compuesto mixto (p. ej. "Jose Maria") → manual
  if (male) return 'M';
  if (female) return 'F';
  return null; // desconocido/unisex → manual
}

let nM = 0;
let nF = 0;
const skipped = [];
const updates = [];
for (const p of targets) {
  const g = classify(p.first_name);
  if (g === 'M') { nM++; updates.push([p.id, 'M']); }
  else if (g === 'F') { nF++; updates.push([p.id, 'F']); }
  else skipped.push(p);
}

console.log(`Modo: ${MODE === 'execute' ? 'EXECUTE (modifica la BD)' : 'DRY-RUN (solo reporte)'}`);
console.log(`Objetivo (pediátricos del tenant en Otro/null): ${targets.length}`);
console.log(`  → Masculino: ${nM}`);
console.log(`  → Femenino:  ${nF}`);
console.log(`  → Omitidos (unisex/ambiguo/desconocido → revisión manual): ${skipped.length}`);

const skFile = join(__dirname, 'gender-skipped.local.txt');
writeFileSync(skFile, skipped.map((p) => `${p.id}  ${(p.first_name ?? '').trim()}`).join('\n') + '\n', 'utf8');
console.log(`Lista de omitidos para revisión manual: ${skFile}`);

if (MODE !== 'execute') {
  console.log('\nDry-run: no se tocó la base de datos. Agrega --execute para aplicar.');
  process.exit(0);
}

console.log('\nAplicando...');
let done = 0;
for (const [id, g] of updates) {
  await reqOk('PATCH', `patients?id=eq.${id}`, { gender: g });
  done++;
  if (done % 100 === 0) console.log(`  ${done}/${updates.length}`);
}
console.log(`\nListo. ${done} pacientes actualizados (${nM} M, ${nF} F). ${skipped.length} omitidos para revisión manual.`);
