-- Sincronización en vivo de citas: publica `appointments` en Realtime para que los cambios de
-- un usuario (nueva cita, reprogramación, estado, cancelación) aparezcan solos en la agenda de
-- los demás sin recargar.
--
-- replica identity full: sin ella, el registro previo de un DELETE trae solo la PK y la RLS
-- (clinic_id = ...) no puede autorizar el evento → las cancelaciones no llegarían. Cuesta algo
-- más de WAL por UPDATE/DELETE, despreciable para el volumen de citas.
--
-- NO se toca RLS: las políticas por clinic_id de appointments (20260610030000) gobiernan también
-- Realtime. Idempotente.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table appointments;
  end if;
end $$;

alter table appointments replica identity full;
