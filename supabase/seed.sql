-- Semilla de la base LOCAL (supabase db reset). Datos inventados: el repo es público.
-- Los usuarios se crean aparte con `npm run db:sembrar` (API admin local), porque auth.users
-- no se siembra bien a mano.

insert into public.plans (code, name, is_active, max_locations, max_doctors, max_assistants, max_storage_mb)
values
  ('SOLO_MEDICO', 'Solo médico', true, 1, 1, 2, 5120),
  ('HOSPITAL', 'Hospital', true, 10, 20, 20, 51200)
on conflict (code) do nothing;

-- HOSPITAL: caben el médico y el admin (los dos cuentan como personal clínico).
insert into public.clinics (id, name, phone, address, plan_code)
values ('00000000-0000-4000-a000-000000000001', 'Clínica de Prueba E2E', '2222-0000', 'Tegucigalpa', 'HOSPITAL');

insert into public.locations (id, clinic_id, name, address)
values ('00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000001', 'Sede Central', 'Tegucigalpa');

insert into public.patients (clinic_id, location_id, first_name, last_name, gender, birth_date, phone)
values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011', 'Ana', 'Prueba Uno', 'F', '1990-03-15', '9999-0001'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011', 'Bruno', 'Prueba Dos', 'M', '1985-07-02', '9999-0002'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011', 'Carla', 'Prueba Tres', 'F', '2018-11-20', '9999-0003');
