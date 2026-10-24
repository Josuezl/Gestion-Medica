-- Calidad y procedencia de la fecha de nacimiento, SIN sobrecargar birth_date con valores mágicos.
--
-- dob_status: confianza en birth_date. Dispara el aviso de "actualizar fecha de nacimiento".
--   exact     = fecha real (capturada en el formulario o del DNI).
--   estimated = derivada de la EDAD durante una migración (no es la fecha real).
--   unknown   = no se tenía la fecha (placeholder histórico 1900-01-01).
-- source: procedencia de la fila.  app = ingresada en el sistema ; migration = importada de un Excel/respaldo.
--
-- IMPORTANTE (integridad): ambas son metadata EXPLÍCITA que se fija al ESCRIBIR la fila (la app deja los
-- defaults exact/app; el script de migración pone estimated/unknown + migration). El sistema NUNCA infiere
-- estos valores a partir de la fecha, así que un paciente real con cualquier fecha NO se marca como
-- estimado, y otros tenants no se ven afectados (todos quedan exact/app por default).

alter table public.patients
  add column if not exists dob_status text not null default 'exact'
    check (dob_status in ('exact', 'estimated', 'unknown')),
  add column if not exists source text not null default 'app'
    check (source in ('app', 'migration'));

comment on column public.patients.dob_status is
  'Confianza en birth_date: exact=real (form/DNI), estimated=derivada de edad en migración, unknown=sin dato (placeholder 1900-01-01).';
comment on column public.patients.source is
  'Procedencia de la fila: app=ingresada en el sistema, migration=importada de un Excel/respaldo.';

-- Backfill puntual (NO es inferencia continua): los pacientes que ya usan el placeholder histórico de DOB
-- desconocida (1900-01-01) significaban "desconocido" en este código; los alineamos con el nuevo flag.
-- Un nacimiento real en esa fecha es inviable, así que no hay falsos positivos.
update public.patients set dob_status = 'unknown' where birth_date = '1900-01-01';

-- Índice parcial: la mayoría son 'exact', así que solo indexamos los que requieren atención
-- (estimated/unknown) para que el aviso "fechas por confirmar" sea barato.
create index if not exists idx_patients_dob_status
  on public.patients (clinic_id, dob_status) where dob_status <> 'exact';
