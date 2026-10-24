-- Buckets de Storage y sus políticas. El dump del esquema base (20261023000000) solo trae el
-- schema public; esto reproduce lo que en producción se creó desde el dashboard y con
-- migraciones-anteriores/20260610000000, 20260610010000 y 20260617000000. Idempotente: se puede
-- correr sobre una base que ya lo tiene.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('medical-studies', 'medical-studies', false, 26214400, ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('prescriptions',   'prescriptions',   false, 26214400, ARRAY['application/pdf']),
  ('signatures',      'signatures',      true,  2097152,  ARRAY['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "studies_insert" on storage.objects;
drop policy if exists "studies_select" on storage.objects;
drop policy if exists "studies_update" on storage.objects;
drop policy if exists "studies_delete" on storage.objects;
drop policy if exists "prescriptions_insert" on storage.objects;
drop policy if exists "prescriptions_select" on storage.objects;
drop policy if exists "prescriptions_update" on storage.objects;
drop policy if exists "prescriptions_delete" on storage.objects;
drop policy if exists "signatures_insert" on storage.objects;
drop policy if exists "signatures_update" on storage.objects;
drop policy if exists "signatures_delete" on storage.objects;

create policy "studies_insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'medical-studies' and (storage.foldername(name))[1] = public.current_clinic_id()::text );
create policy "studies_select" on storage.objects for select to authenticated
  using ( bucket_id = 'medical-studies' and (storage.foldername(name))[1] = public.current_clinic_id()::text );
create policy "studies_update" on storage.objects for update to authenticated
  using ( bucket_id = 'medical-studies' and (storage.foldername(name))[1] = public.current_clinic_id()::text )
  with check ( bucket_id = 'medical-studies' and (storage.foldername(name))[1] = public.current_clinic_id()::text );
create policy "studies_delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'medical-studies' and (storage.foldername(name))[1] = public.current_clinic_id()::text );

create policy "prescriptions_insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'prescriptions' and (storage.foldername(name))[1] = public.current_clinic_id()::text );
create policy "prescriptions_select" on storage.objects for select to authenticated
  using ( bucket_id = 'prescriptions' and (storage.foldername(name))[1] = public.current_clinic_id()::text );
create policy "prescriptions_update" on storage.objects for update to authenticated
  using ( bucket_id = 'prescriptions' and (storage.foldername(name))[1] = public.current_clinic_id()::text )
  with check ( bucket_id = 'prescriptions' and (storage.foldername(name))[1] = public.current_clinic_id()::text );
create policy "prescriptions_delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'prescriptions' and (storage.foldername(name))[1] = public.current_clinic_id()::text );

create policy "signatures_insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'signatures' and (storage.foldername(name))[1] = public.current_clinic_id()::text );
create policy "signatures_update" on storage.objects for update to authenticated
  using ( bucket_id = 'signatures' and (storage.foldername(name))[1] = public.current_clinic_id()::text );
create policy "signatures_delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'signatures' and (storage.foldername(name))[1] = public.current_clinic_id()::text );
