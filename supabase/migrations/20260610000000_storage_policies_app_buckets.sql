-- Fix: "new row violates row-level security policy" al subir estudios/recetas.
--
-- El código sube a los buckets 'medical-studies' (estudios) y 'prescriptions' (recetas PDF),
-- pero las únicas políticas de storage existentes cubrían 'recetas'/'estudios'/'firmas'.
-- Sin política para esos buckets, RLS niega por defecto.
--
-- Estas políticas replican el aislamiento por tenant del resto del sistema: la primera
-- carpeta del objeto ({clinic_id}/{patient_id}/archivo) debe coincidir con current_clinic_id().
-- Se incluye UPDATE porque las subidas usan upsert:true (INSERT+SELECT+UPDATE).
--
-- Requisito: los buckets 'medical-studies' y 'prescriptions' deben existir y ser privados
-- (public = false). El acceso de lectura del paciente se hace por signed URLs.

-- Bucket: medical-studies
create policy "studies_insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'medical-studies' and (storage.foldername(name))[1] = current_clinic_id()::text );
create policy "studies_select" on storage.objects for select to authenticated
  using ( bucket_id = 'medical-studies' and (storage.foldername(name))[1] = current_clinic_id()::text );
create policy "studies_update" on storage.objects for update to authenticated
  using ( bucket_id = 'medical-studies' and (storage.foldername(name))[1] = current_clinic_id()::text )
  with check ( bucket_id = 'medical-studies' and (storage.foldername(name))[1] = current_clinic_id()::text );
create policy "studies_delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'medical-studies' and (storage.foldername(name))[1] = current_clinic_id()::text );

-- Bucket: prescriptions
create policy "prescriptions_insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'prescriptions' and (storage.foldername(name))[1] = current_clinic_id()::text );
create policy "prescriptions_select" on storage.objects for select to authenticated
  using ( bucket_id = 'prescriptions' and (storage.foldername(name))[1] = current_clinic_id()::text );
create policy "prescriptions_update" on storage.objects for update to authenticated
  using ( bucket_id = 'prescriptions' and (storage.foldername(name))[1] = current_clinic_id()::text )
  with check ( bucket_id = 'prescriptions' and (storage.foldername(name))[1] = current_clinic_id()::text );
create policy "prescriptions_delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'prescriptions' and (storage.foldername(name))[1] = current_clinic_id()::text );
