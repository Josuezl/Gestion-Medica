-- Apaga la subida de «Estudios Médicos» (archivos a Storage) en todos los tenants.
-- Se corre en Supabase DESPUÉS del despliegue que esconde la pestaña (utils/features.ts): quitar
-- permisos va cuando ningún código los usa (docs/despliegue-sin-errores.md, regla 2).
--
-- Sin estos permisos ni la interfaz ni una llamada directa a la API pueden subir o sobrescribir
-- archivos del bucket medical-studies ni crear registros en public.studies. Se dejan los de leer y
-- borrar. Para reactivar: volver a crear las cuatro políticas (ver 20261023000001_storage_buckets.sql
-- y el esquema base) y poner SUBIDA_ESTUDIOS_HABILITADA en true.
drop policy if exists "studies_insert" on storage.objects;
drop policy if exists "studies_update" on storage.objects;
drop policy if exists "studies_insert" on public.studies;
drop policy if exists "studies_update" on public.studies;
