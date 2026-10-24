-- Código de verificación para consultas, para poder validar las INCAPACIDADES médicas con
-- QR igual que las recetas. Se asigna a TODAS las consultas (default en BD + backfill) para
-- que cualquier impresión tenga un QR válido, sin lógica nueva en la app.
alter table public.consultations
  add column if not exists verification_code varchar(100);

-- Backfill de las consultas existentes (todos los tenants) con un código único.
update public.consultations
set verification_code = 'INC-' || upper(substr(md5(gen_random_uuid()::text), 1, 9))
where verification_code is null;

-- Nuevas consultas: la BD asigna el código automáticamente.
alter table public.consultations
  alter column verification_code set default ('INC-' || upper(substr(md5(gen_random_uuid()::text), 1, 9)));

create unique index if not exists consultations_verification_code_key
  on public.consultations (verification_code);
