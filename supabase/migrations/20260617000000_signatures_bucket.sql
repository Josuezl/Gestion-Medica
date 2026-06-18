-- Bucket PÚBLICO para la firma/sello del médico. Debe ser público porque la receta se
-- muestra en páginas públicas (verificación y vista del paciente) que renderizan
-- signature_url directo en <img>. La firma va impresa en la receta, así que es de baja
-- sensibilidad; la ruta incluye clinic_id/doctor_id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', true, 2097152, ARRAY['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Escritura solo por usuarios autenticados dentro de su propia clínica (carpeta = clinic_id).
create policy "signatures_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'signatures' and (storage.foldername(name))[1] = current_clinic_id()::text);
create policy "signatures_update" on storage.objects for update to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = current_clinic_id()::text);
create policy "signatures_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = current_clinic_id()::text);
-- Lectura pública: al ser bucket public=true, los objetos se sirven por URL pública.
