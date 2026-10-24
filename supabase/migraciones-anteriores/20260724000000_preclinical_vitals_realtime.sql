-- Sincronización en vivo de la pre-clínica: publica preclinical_vitals en Realtime para que los
-- signos que toma la asistente aparezcan solos en la pantalla del médico (agenda y Nueva
-- Consulta) sin recargar. Antes, cada pantalla era una foto tomada al abrirla: si la asistente
-- registraba después, el médico no se enteraba.
--
-- NO se toca RLS: la política por clinic_id de preclinical_vitals (20260620010000) también
-- gobierna Realtime, así que un usuario solo recibe eventos de su propia clínica. Si el token
-- no viajara, el efecto sería no recibir eventos — nunca datos de otra clínica.
--
-- Solo se publica esta tabla; ninguna otra queda expuesta. Idempotente.
do $$
begin
  -- En proyectos Supabase la publicación viene creada; se contempla que no exista por si el
  -- esquema se levanta desde cero.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'preclinical_vitals'
  ) then
    alter publication supabase_realtime add table preclinical_vitals;
  end if;
end $$;
