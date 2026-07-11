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

## Limitaciones conocidas (aceptadas en el spec)

- **No es point-in-time**: recuperas la foto de la 01:15 de esa noche; lo escrito después se pierde.
- Las tablas se exportan con segundos de diferencia (no es un snapshot transaccional).
- `auth.users` (contraseñas/sesiones) NO se exporta — PostgREST no lo expone. Tras una pérdida
  total, los usuarios se recrean por invitación (flujo normal de la app) y `user_profiles` los
  re-liga. Los datos clínicos, que son lo irremplazable, sí están completos.
- Cuando San Martín crezca: Supabase Pro (US$25/mes) da backups diarios reales + PITR opcional.
