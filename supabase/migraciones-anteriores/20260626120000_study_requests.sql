-- Solicitudes de estudios (estudios de gabinete: cardiología, radiología/ultrasonido, etc.):
-- catálogo editable por clínica + solicitudes ligadas a la consulta. Mismo patrón que lab_orders,
-- con una diferencia clave: cada estudio del catálogo lleva una DESCRIPCIÓN y una INDICACIÓN para el
-- paciente (preparación: ayuno, suspender medicamentos, llevar acompañante, etc.), que se imprimen.
-- Multi-tenant: cada fila lleva clinic_id y se aísla por RLS con el mismo idiom del resto del esquema
-- (clinic_id = el del user_profiles del usuario autenticado).

-- 1. Catálogo: secciones (Cardiología, Radiología, ...)
create table if not exists study_sections (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);
create index if not exists idx_study_sections_clinic on study_sections(clinic_id);

-- 2. Catálogo: estudios (cada uno pertenece a una sección y trae descripción + indicación)
create table if not exists study_catalog (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  section_id uuid not null references study_sections(id) on delete cascade,
  name text not null,
  description text,            -- descripción breve del estudio
  patient_indication text,     -- indicaciones/recomendaciones de preparación para el paciente
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz default now()
);
create index if not exists idx_study_catalog_clinic on study_catalog(clinic_id);
create index if not exists idx_study_catalog_section on study_catalog(section_id);

-- 3. Solicitudes: snapshot de lo solicitado (no se hace join al catálogo al imprimir). La indicación
--    se guarda dentro del JSONB para que el documento sea autocontenido aunque luego se edite el catálogo.
create table if not exists study_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  consultation_id uuid not null references consultations(id) on delete cascade,
  doctor_id uuid not null references user_profiles(id) on delete restrict,
  studies jsonb not null default '[]'::jsonb,   -- [{ "section": "...", "name": "...", "description": "...", "indication": "..." }]
  other_studies text,
  verification_code varchar(100),
  created_at timestamptz default now()
);
create index if not exists idx_study_requests_clinic on study_requests(clinic_id);
create index if not exists idx_study_requests_consultation on study_requests(consultation_id);
create index if not exists idx_study_requests_patient on study_requests(patient_id);

-- RLS: aislamiento por tenant. Se separan las políticas de INSERT con WITH CHECK (FOR ALL USING no
-- cubre INSERT; ver 20260610030000_fix_rls_insert_policies.sql). Cualquier médico de la clínica puede
-- insertar tanto solicitudes como nuevas filas de catálogo (alta rápida desde el modal).
alter table study_sections enable row level security;
alter table study_catalog enable row level security;
alter table study_requests enable row level security;

create policy "study_sections_select" on study_sections
  for select using (clinic_id = (select clinic_id from user_profiles where id = auth.uid()));
create policy "study_sections_insert" on study_sections
  for insert with check (clinic_id = (select clinic_id from user_profiles where id = auth.uid()));
create policy "study_sections_update" on study_sections
  for update using (clinic_id = (select clinic_id from user_profiles where id = auth.uid()));
create policy "study_sections_delete" on study_sections
  for delete using (clinic_id = (select clinic_id from user_profiles where id = auth.uid()));

create policy "study_catalog_select" on study_catalog
  for select using (clinic_id = (select clinic_id from user_profiles where id = auth.uid()));
create policy "study_catalog_insert" on study_catalog
  for insert with check (clinic_id = (select clinic_id from user_profiles where id = auth.uid()));
create policy "study_catalog_update" on study_catalog
  for update using (clinic_id = (select clinic_id from user_profiles where id = auth.uid()));
create policy "study_catalog_delete" on study_catalog
  for delete using (clinic_id = (select clinic_id from user_profiles where id = auth.uid()));

create policy "study_requests_select" on study_requests
  for select using (clinic_id = (select clinic_id from user_profiles where id = auth.uid()));
create policy "study_requests_insert" on study_requests
  for insert with check (clinic_id = (select clinic_id from user_profiles where id = auth.uid()));
create policy "study_requests_update" on study_requests
  for update using (clinic_id = (select clinic_id from user_profiles where id = auth.uid()));
create policy "study_requests_delete" on study_requests
  for delete using (clinic_id = (select clinic_id from user_profiles where id = auth.uid()));
