-- Presión arterial por brazo (aditivo: se corre en Supabase ANTES del push).
--
-- `blood_pressure` se sigue llenando con la lectura principal (izquierdo, o derecho si es el único),
-- así el código viejo, las pestañas abiertas y las consultas antiguas siguen funcionando.
-- Las columnas nuevas guardan a qué brazo pertenece cada lectura; NULL = no se indicó.
alter table public.consultations
  add column if not exists blood_pressure_left text,
  add column if not exists blood_pressure_right text;

alter table public.preclinical_vitals
  add column if not exists blood_pressure_left text,
  add column if not exists blood_pressure_right text;

-- Opción por clínica: exige presión arterial con al menos un brazo en pacientes NO pediátricos
-- (consulta y pre-clínica). false = el brazo es opcional (todos los demás tenants).
alter table public.clinics
  add column if not exists require_bp_arm boolean not null default false;

comment on column public.clinics.require_bp_arm is
  'Exige presión arterial con al menos un brazo en pacientes no pediátricos (consulta y pre-clínica).';

-- Centro Neurológico y Cardiovascular (licencia HOSPITAL). Mismo filtro que
-- 20260614000000_clinic_max_locations_override.sql para no tocar otro tenant homónimo.
update public.clinics
set require_bp_arm = true
where name ilike '%Centro Neuro%'
  and plan_code = 'HOSPITAL';
