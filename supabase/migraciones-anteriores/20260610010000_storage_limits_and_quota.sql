-- Control de almacenamiento: límite de tamaño/MIME por bucket + cuota por plan.

-- 1) Límite de tamaño (25 MB) y tipos permitidos a nivel de bucket.
--    Lo enforcea el propio Storage; ni la service_role lo salta.
update storage.buckets
  set file_size_limit = 26214400,  -- 25 MB
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf']
  where id = 'medical-studies';

update storage.buckets
  set file_size_limit = 26214400,
      allowed_mime_types = ARRAY['application/pdf']
  where id = 'prescriptions';

-- 2) Cuota de almacenamiento por plan (en MB).
-- El default de 1 GB cubre cualquier plan futuro que se cree sin asignar cuota.
alter table public.plans add column if not exists max_storage_mb integer not null default 1024;

update public.plans set max_storage_mb = 5120  where code = 'SOLO_MEDICO';  -- 5 GB
update public.plans set max_storage_mb = 10240 where code = 'HOSPITAL';     -- 10 GB

-- 3) Uso de almacenamiento del tenant actual (bytes), scoped por clínica.
--    SECURITY DEFINER para poder leer storage.objects; solo devuelve el total
--    del propio tenant (current_clinic_id()), así que es seguro exponerla.
create or replace function public.clinic_storage_bytes()
returns bigint
language sql
stable
security definer
set search_path = public, storage
as $function$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
  from storage.objects o
  where o.bucket_id in ('medical-studies','prescriptions')
    and (storage.foldername(o.name))[1] = current_clinic_id()::text;
$function$;
