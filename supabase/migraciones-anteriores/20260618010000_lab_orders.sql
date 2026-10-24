-- Órdenes de laboratorio: catálogo editable por clínica + solicitudes ligadas a la consulta.
-- Multi-tenant: cada fila lleva clinic_id y se aísla por RLS con el mismo idiom del resto del esquema
-- (clinic_id = el del user_profiles del usuario autenticado).

-- 1. Catálogo: categorías
create table if not exists lab_test_categories (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);
create index if not exists idx_lab_test_categories_clinic on lab_test_categories(clinic_id);

-- 2. Catálogo: exámenes (cada uno pertenece a una categoría)
create table if not exists lab_tests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  category_id uuid not null references lab_test_categories(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz default now()
);
create index if not exists idx_lab_tests_clinic on lab_tests(clinic_id);
create index if not exists idx_lab_tests_category on lab_tests(category_id);

-- 3. Órdenes: snapshot de lo solicitado (no se hace join al catálogo al imprimir)
create table if not exists lab_orders (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  consultation_id uuid not null references consultations(id) on delete cascade,
  doctor_id uuid not null references user_profiles(id) on delete restrict,
  tests jsonb not null default '[]'::jsonb,   -- [{ "category": "...", "name": "..." }]
  other_tests text,
  created_at timestamptz default now()
);
create index if not exists idx_lab_orders_clinic on lab_orders(clinic_id);
create index if not exists idx_lab_orders_consultation on lab_orders(consultation_id);
create index if not exists idx_lab_orders_patient on lab_orders(patient_id);

-- RLS: aislamiento por tenant (mismo patrón que patients/consultations/prescriptions)
alter table lab_test_categories enable row level security;
alter table lab_tests enable row level security;
alter table lab_orders enable row level security;

create policy "lab_test_categories_policy" on lab_test_categories
  for all using (clinic_id = (select clinic_id from user_profiles where id = auth.uid()));
create policy "lab_tests_policy" on lab_tests
  for all using (clinic_id = (select clinic_id from user_profiles where id = auth.uid()));
create policy "lab_orders_policy" on lab_orders
  for all using (clinic_id = (select clinic_id from user_profiles where id = auth.uid()));
