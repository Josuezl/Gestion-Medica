# Backup casero de Supabase (plan Free sin backups automáticos)

**Fecha:** 2026-07-11
**Estado:** Aprobado por el usuario (opción 1: backup casero gratis)

## Problema

El plan Free de Supabase NO incluye backups automáticos ("Not included", verificado en
supabase.com/pricing el 2026-07-11). Los expedientes médicos de la clínica San Martín existen en
una sola copia: un `DELETE` mal escrito, una migración con error o un incidente de Supabase = pérdida
total. Objetivo: pasar de "cero copias" a "copia de ayer" sin costo.

## Diseño

### Export (`scripts/backup-export.mjs`)

- Usa la **service-role key** vía supabase-js (mismo patrón que las migraciones de datos del repo).
- **Descubre las tablas dinámicamente** con el OpenAPI del PostgREST (`GET {url}/rest/v1/` con la
  key): las tablas nuevas entran solas al backup, sin lista que mantener.
- Exporta cada tabla paginando de a 1000 filas (límite de PostgREST que ya nos mordió antes),
  ordenando por `id` cuando la tabla lo tiene (paginación estable).
- Escribe `backup-out/<tabla>.json` + `backup-out/manifest.json` (timestamp, conteo por tabla).
- **Solo lectura** — seguro contra producción.
- Limitación aceptada: no es transaccional entre tablas (segundos de diferencia) ni point-in-time.

### Verificación (`scripts/backup-verify.mjs` + lógica pura en `scripts/backup-lib.mjs`)

- Re-lee el directorio del backup: cada JSON parsea, su conteo coincide con el manifest, y las
  tablas núcleo (clinics, user_profiles, patients, consultations, prescriptions, appointments)
  no están vacías. Sale con código 1 si algo falla → el Action falla → GitHub notifica por correo.
- La lógica pura (comparación manifest vs archivos, elección de columna de orden) vive en
  `backup-lib.mjs` y se testea con vitest.

### Cifrado (obligatorio: el repo es PÚBLICO y los artifacts son descargables por cualquiera)

- `tar.gz` del directorio → `openssl enc -aes-256-cbc -pbkdf2 -iter 200000` con passphrase en el
  secret `BACKUP_PASSPHRASE`. Nada sale del runner sin cifrar.

### GitHub Action (`.github/workflows/db-backup.yml`)

- Cron diario 07:15 UTC (01:15 en Honduras, fuera de horario de clínica) + `workflow_dispatch`
  para corridas manuales.
- Pasos: checkout → node 24 + npm ci → export → verify → tar+cifrar → subir artifact
  (`db-backup-YYYY-MM-DD`, retención 30 días).
- Secrets requeridos (los agrega el usuario en Settings → Secrets → Actions):
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_PASSPHRASE`.
- Si el workflow falla, GitHub envía correo al dueño (notificación por defecto).

### Restauración (`docs/backup-restore.md`)

Documenta: descargar artifact → descifrar → verificar → restaurar por tabla (SQL editor o script
service-role). Se prueba el round-trip completo (export → cifrar → descifrar → verify) localmente
antes del primer push.

## Fuera de alcance

pg_dump/PITR (requeriría el connection string y plan Pro para hacerlo bien), storage externo,
retención >30 días. Si San Martín crece: Supabase Pro (US$25/mes) con backups diarios reales.
