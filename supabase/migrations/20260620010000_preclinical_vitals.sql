-- Pre-clínica: signos vitales que la Auxiliar de Enfermería (o el médico) toma ANTES de la consulta.
-- Una fila = una toma de signos, independiente de la consulta. El médico, al abrir "Nueva consulta",
-- carga la pendiente más reciente del paciente (de hoy) y, al completar la consulta, esta fila se marca
-- como consumida (consumed_at + consultation_id) como bitácora de quién tomó los signos y cuándo.
--
-- Multi-tenant: cada fila lleva clinic_id y se aísla por RLS con el mismo idiom del resto del esquema.
create table if not exists preclinical_vitals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,  -- contexto opcional (de qué cita salió)
  recorded_by uuid not null references user_profiles(id) on delete restrict,
  blood_pressure varchar(20),
  temperature numeric(4,1),       -- °C
  weight numeric(5,2),            -- kg
  height numeric(5,2),            -- cm
  head_circumference numeric(4,1),-- cm (pediátrico)
  heart_rate integer,             -- bpm
  oxygen_saturation integer,      -- SpO2 (%)
  notes text,                     -- observación de enfermería (opcional)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  consumed_at timestamptz,                                    -- cuándo se cerró la consulta con estos datos
  consultation_id uuid references consultations(id) on delete set null
);

-- Para buscar rápido la pendiente más reciente de un paciente (consumed_at is null).
create index if not exists idx_preclinical_vitals_clinic on preclinical_vitals(clinic_id);
create index if not exists idx_preclinical_vitals_pending
  on preclinical_vitals(patient_id, created_at desc)
  where consumed_at is null;

-- RLS: aislamiento por tenant (mismo patrón que patients/consultations/lab_orders).
alter table preclinical_vitals enable row level security;

create policy "preclinical_vitals_policy" on preclinical_vitals
  for all using (clinic_id = (select clinic_id from user_profiles where id = auth.uid()));
