# Backup casero de Supabase: cómo funciona y cómo restaurar

El plan Free de Supabase **no incluye backups automáticos**, así que este repo corre un backup
diario propio (workflow `DB Backup`, 01:15 hora de Honduras): exporta TODAS las tablas a JSON con
la service-role key, verifica los conteos, **cifra con AES-256** y sube el resultado como artifact
de GitHub Actions con 30 días de retención. El repo es público: por eso nada sube sin cifrar.

Si el workflow falla cualquier noche, GitHub te manda correo (notificación por defecto al dueño).

## Secrets requeridos (una sola vez)

En GitHub → Settings → Secrets and variables → Actions:

| Secret | Valor |
| --- | --- |
| `SUPABASE_URL` | `https://<proyecto>.supabase.co` (el mismo NEXT_PUBLIC_SUPABASE_URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role |
| `BACKUP_PASSPHRASE` | Frase larga y aleatoria (¡guárdala en tu gestor de contraseñas! Sin ella el backup es irrecuperable) |

## Correr un backup manual

GitHub → Actions → **DB Backup** → *Run workflow*. O local:

```bash
node --env-file=.env.local scripts/backup-export.mjs
node scripts/backup-verify.mjs backup-out
```

## Restaurar

1. **Descargar**: GitHub → Actions → corrida de DB Backup → artifact `db-backup-...` (zip con
   `backup.tar.gz.enc` adentro).

2. **Descifrar y verificar**:

```bash
export BACKUP_PASSPHRASE='la-frase-del-gestor'
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in backup.tar.gz.enc -out backup.tar.gz -pass env:BACKUP_PASSPHRASE
tar -xzf backup.tar.gz          # crea backup-out/ con un .json por tabla + manifest.json
node scripts/backup-verify.mjs backup-out
```

3. **Restaurar datos**. Cada `backup-out/<tabla>.json` es un array de filas tal cual la tabla.
   Según el desastre:

   - **Borré/dañé filas de UNA tabla** (caso típico): restaurar solo esas filas vía service-role.
     Ejemplo con Node (upsert respeta los `id` originales):

     ```js
     // node --env-file=.env.local
     import { createClient } from '@supabase/supabase-js'
     import { readFile } from 'node:fs/promises'
     const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
     const rows = JSON.parse(await readFile('backup-out/patients.json', 'utf8'))
     for (let i = 0; i < rows.length; i += 500) {
       const { error } = await s.from('patients').upsert(rows.slice(i, i + 500))
       if (error) throw error
     }
     ```

   - **Perdí el proyecto entero**: crear proyecto nuevo en Supabase, aplicar las migraciones de
     `supabase/migrations/` (SQL editor, como siempre), y luego upsert de las tablas en orden de
     dependencias: `plans` → `clinics` → `user_profiles` → `locations` → `patients` →
     `doctor_schedules` → `appointments` → `consultations` → `prescriptions` → `lab_orders` →
     `study_requests` → resto. (Los FKs mandan; si un insert falla por FK, restaura antes la
     tabla referenciada.)

## Respaldo completo en R2 (job `respaldo-r2`)

Desde 2026-10-24 el mismo workflow sube cada noche a un bucket propio de Cloudflare R2:

| Clave en R2 | Contenido | Retención |
| --- | --- | --- |
| `diario/AAAA-MM-DD_HHMM.tar.gz.enc` | `supabase db dump`: `roles.sql`, `schema.sql`, `data.sql` (incluye **las cuentas de `auth`** con sus contraseñas cifradas). `audit_logs` solo los domingos y en corridas manuales (`incluye-audit-logs.txt` lo indica). | Bucket lock 30 días + ciclo de vida que borra a los 31 |
| `archivos/<generación>/<bucket>/<ruta>@<versión>.enc` | Cada archivo de Storage, cifrado por separado. Solo se agregan; si un archivo se reemplazó hay varias versiones: usar la de número mayor. La generación (`k2`…) cambia cada vez que se rota `BACKUP_PASSPHRASE` (ver `GENERACION_CLAVE` en `scripts/respaldo-r2-archivos.mjs`): usar la generación más alta. | Bucket lock 30 días; no se borran |

Antes de subir, el job restaura el dump en una base Supabase local vacía del runner y compara
conteos con producción; si no cuadra, no sube nada y GitHub avisa por correo.

**Rotar `BACKUP_PASSPHRASE`:** guardar la nueva en el gestor (y una segunda copia fuera de él), actualizar el secreto y subir `GENERACION_CLAVE` en `scripts/respaldo-r2-archivos.mjs`; si no, los archivos ya subidos seguirían cifrados con la frase anterior. (Pasó el 2026-10-24: la frase de julio nunca se guardó y se rotó.)

Secrets adicionales: `SUPABASE_DB_URL` (cadena del **session pooler**, con la contraseña de la base),
`R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (token de R2 con Object Read &
Write **solo** sobre ese bucket).

### Restaurar desde R2 (pérdida total del proyecto)

1. Descargar el archivo del día (panel de Cloudflare o `aws s3 cp s3://<bucket>/diario/<archivo> . --endpoint-url <R2_ENDPOINT>`).
2. Descifrar y abrir:

   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
     -in AAAA-MM-DD_HHMM.tar.gz.enc -out base.tar.gz -pass env:BACKUP_PASSPHRASE
   tar -xzf base.tar.gz   # crea dump/roles.sql, dump/schema.sql, dump/data.sql
   ```

3. Crear un proyecto Supabase nuevo y restaurar (procedimiento oficial de Supabase, con la cadena del
   session pooler del proyecto NUEVO):

   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file dump/roles.sql --file dump/schema.sql \
     --command 'SET session_replication_role = replica' \
     --file dump/data.sql --dbname "<cadena del proyecto nuevo>"
   ```

   Si falla por `GRANT SET ON PARAMETER … TO "supabase_realtime_admin"` (o por `OWNER TO`), comentar
   esa línea y repetir: son los errores comunes que documenta Supabase. Probado el 2026-10-24 en una
   base local: conteos, contraseñas de `auth.users`, funciones y las 55 políticas RLS quedan iguales.
   Después: volver a habilitar las publicaciones de Realtime en el panel, y si el día del respaldo
   no incluía `audit_logs`, cargar la bitácora desde el respaldo del domingo anterior.
4. Archivos: descargar `archivos/`, descifrar cada uno con el mismo comando `openssl enc -d …` y
   subirlo al bucket de Storage correspondiente (`<bucket>/<ruta>`, sin la generación ni el sufijo `@<versión>.enc`).

## Limitaciones conocidas (aceptadas en el spec)

- **No es point-in-time**: recuperas la foto de la 01:15 de esa noche; lo escrito después se pierde.
- Las tablas se exportan con segundos de diferencia (no es un snapshot transaccional).
- El artifact de GitHub NO incluye `auth.users` (PostgREST no lo expone) ni Storage; el respaldo de
  R2 sí los incluye.
