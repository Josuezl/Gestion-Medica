/**
 * Verificación de la migración CNA (2ª clínica de Manuel). Solo lectura.
 * No imprime datos de pacientes.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const CLINIC_ID = '6da8729c-65f8-43b5-afcb-842fa15e7663';
const CAROL = 'c0c88482-181e-4cf2-b4d5-9112274a5485';
const MANUEL = '55aa8901-7cc3-4012-9d65-70cc1882a025';
const CNA_REASON = 'Migrados de CNA';

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

const reason = encodeURIComponent(CNA_REASON);

check('Consultas "Migrados de CNA" (Manuel)',
  await count(`consultations?clinic_id=eq.${CLINIC_ID}&doctor_id=eq.${MANUEL}&reason_for_visit=eq.${reason}&select=id`), 924);
check('Consultas CNA con otro doctor (debe ser 0)',
  await count(`consultations?clinic_id=eq.${CLINIC_ID}&reason_for_visit=eq.${reason}&doctor_id=not.in.(${MANUEL})&select=id`), 0);
check('Consultas CNA huérfanas sin paciente (debe ser 0)',
  await count(`consultations?reason_for_visit=eq.${reason}&patient_id=is.null&select=id`), 0);
check('Pacientes del tenant (4037 + 488)',
  await count(`patients?clinic_id=eq.${CLINIC_ID}&select=id`), 4525);
check('Total consultas del tenant (7567 + 924)',
  await count(`consultations?clinic_id=eq.${CLINIC_ID}&select=id`), 8491);
check('Consultas de Manuel (3051 + 924)',
  await count(`consultations?clinic_id=eq.${CLINIC_ID}&doctor_id=eq.${MANUEL}&select=id`), 3975);
check('Consultas de Carol (sin cambios)',
  await count(`consultations?clinic_id=eq.${CLINIC_ID}&doctor_id=eq.${CAROL}&select=id`), 4516);

const [min] = await one(`consultations?reason_for_visit=eq.${reason}&select=created_at&order=created_at.asc&limit=1`);
const [max] = await one(`consultations?reason_for_visit=eq.${reason}&select=created_at&order=created_at.desc&limit=1`);
console.log(`· Rango consultas CNA: ${min.created_at.slice(0, 10)} → ${max.created_at.slice(0, 10)} (esperado 2023–2026)`);

console.log(checks.every(Boolean) ? '\nTODO OK ✓' : '\nHAY FALLOS ✗');
process.exit(checks.every(Boolean) ? 0 : 1);
