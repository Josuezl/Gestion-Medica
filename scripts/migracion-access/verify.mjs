/**
 * Verificación post-migración: conteos, separación por doctor y rangos de fechas.
 * Solo lectura. No imprime datos de pacientes.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const CLINIC_ID = '6da8729c-65f8-43b5-afcb-842fa15e7663';
const CAROL = 'c0c88482-181e-4cf2-b4d5-9112274a5485';
const MANUEL = '55aa8901-7cc3-4012-9d65-70cc1882a025';

const env = readFileSync(join(ROOT, '.env.local'), 'utf8');
const get = (k) =>
  env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '');
const URL_ = get('NEXT_PUBLIC_SUPABASE_URL');
const KEY = get('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function count(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method: 'HEAD',
    headers: { ...H, Prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return Number(res.headers.get('content-range').split('/')[1]);
}

async function one(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: H });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const checks = [];
const check = (name, actual, expected) => {
  const ok = actual === expected;
  checks.push(ok);
  console.log(`${ok ? '✓' : '✗'} ${name}: ${actual}${ok ? '' : ` (esperado ${expected})`}`);
};

check('Pacientes de la clínica', await count(`patients?clinic_id=eq.${CLINIC_ID}&select=id`), 4037);
check('Consultas de la clínica', await count(`consultations?clinic_id=eq.${CLINIC_ID}&select=id`), 7567);
check('Consultas de Carol', await count(`consultations?clinic_id=eq.${CLINIC_ID}&doctor_id=eq.${CAROL}&select=id`), 4516);
check('Consultas de Manuel', await count(`consultations?clinic_id=eq.${CLINIC_ID}&doctor_id=eq.${MANUEL}&select=id`), 3051);
check(
  'Consultas con otro doctor (debe ser 0)',
  await count(`consultations?clinic_id=eq.${CLINIC_ID}&doctor_id=not.in.(${CAROL},${MANUEL})&select=id`),
  0
);
check(
  'Consultas huérfanas sin paciente (debe ser 0)',
  await count(`consultations?clinic_id=eq.${CLINIC_ID}&patient_id=is.null&select=id`),
  0
);

for (const [name, id, years] of [['Carol', CAROL, '2019–2026'], ['Manuel', MANUEL, '2021–2026']]) {
  const [min] = await one(`consultations?doctor_id=eq.${id}&select=created_at&order=created_at.asc&limit=1`);
  const [max] = await one(`consultations?doctor_id=eq.${id}&select=created_at&order=created_at.desc&limit=1`);
  console.log(`· Rango consultas ${name}: ${min.created_at.slice(0, 10)} → ${max.created_at.slice(0, 10)} (esperado ${years})`);
}

console.log(checks.every(Boolean) ? '\nTODO OK ✓' : '\nHAY FALLOS ✗');
process.exit(checks.every(Boolean) ? 0 : 1);
