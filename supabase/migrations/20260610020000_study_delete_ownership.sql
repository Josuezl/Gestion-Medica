-- Borrado de estudios médicos: solo el MÉDICO que lo subió o el ADMIN de la organización.
-- Los asistentes nunca pueden borrar.

-- 1. Registrar quién subió cada estudio.
alter table public.studies
  add column if not exists uploaded_by uuid references public.user_profiles(id) on delete set null;

-- 2. Política de borrado: org-admin, o el autor siempre que sea DOCTOR.
drop policy if exists studies_delete on public.studies;
create policy studies_delete on public.studies for delete
  using (
    clinic_id = current_clinic_id()
    and (
      is_org_admin_now()
      or (uploaded_by = auth.uid() and current_user_role() = 'DOCTOR')
    )
  );

-- 3. Auditoría: función SECURITY DEFINER para escribir en audit_logs.
--    (Los usuarios no pueden insertar directo en audit_logs; RLS lo niega.
--     Esta función registra de forma controlada el evento del propio tenant.)
create or replace function public.log_audit_event(p_action varchar, p_record_id uuid, p_table_name varchar)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare v_clinic uuid;
begin
  v_clinic := current_clinic_id();
  if v_clinic is null then return; end if;
  insert into public.audit_logs (clinic_id, performed_by, action, record_id, table_name)
  values (v_clinic, auth.uid(), p_action, p_record_id, p_table_name);
end;
$function$;
