# Simulacro de restauración completa + inventario de llaves — plan para otra sesión

> Pedido por el usuario el 2026-10-24. Nada de esto toca la app en producción; el simulacro usa un
> proyecto Supabase aparte que se **borra al terminar** (tendrá datos reales de pacientes).
> Restricción firme: nunca Supabase Pro. **Ningún valor de secreto va en este documento ni en el chat**:
> solo nombres, dónde viven y cómo se rotan.

## 1. Inventario de llaves (llenarlo con el usuario)

Para cada una: dónde está guardada (y la 2.ª copia), quién más tiene acceso, cómo se rota, qué pasa si
se pierde y qué pasa si se filtra.

| Prioridad | Llave | Si se pierde | Si se filtra |
|---|---|---|---|
| 1 | Contraseña maestra de Bitwarden + 2FA (y sus códigos de recuperación) | Se pierden TODAS las demás a la vez | Acceso a todo |
| 2 | `BACKUP_PASSPHRASE` (Gestión Médica) — Bitwarden «Gestión Médica – passphrase de respaldos» | Respaldos irrecuperables (no hay reset) | Cualquiera con un respaldo lo abre → rotar |
| 2 | Contraseña de restic (Control) — Bitwarden «Control ERP – contraseña de respaldos (restic)» | Ídem para Control | Ídem |
| 3 | Códigos de recuperación 2FA: Supabase, GitHub, Cloudflare, Vercel | Sin acceso a la cuenta si se pierde el celular | — |
| 4 | `SUPABASE_SERVICE_ROLE_KEY` (GitHub, Vercel, `.env.local`) | Se regenera | Acceso total a producción, salta RLS → rotar ya |
| 4 | Contraseña de la base `postgres` (dentro de `SUPABASE_DB_URL`; rotada el 2026-10-24) | Se resetea en Supabase | Acceso total por conexión directa → rotar |
| 4 | Token R2 `gestion-medica-respaldos-github` (solo en GitHub) | Se crea otro | Puede subir al bucket; el bucket lock impide borrar 30 días → revocar |
| 4 | `RESEND_API_KEY`, `CRON_SECRET` (Vercel) | Se regeneran | Envío de correos / disparar cron → rotar |

Pendientes ya identificados: segunda copia en papel de las dos frases de respaldo; Emergency Access de
Bitwarden con una persona de confianza; confirmar que existen y dónde están los códigos 2FA de las
cuatro cuentas.

## 2. Simulacro de restauración completa

1. Crear un proyecto Supabase Free aparte (el segundo gratuito).
2. Descargar de R2 el último `diario/…tar.gz.enc` y los `archivos/<generación de estado/generacion.txt>/…`.
3. Restaurar con `docs/backup-restore.md` (roles → schema → data). Anotar cada error y su arreglo.
4. Subir los archivos de Storage. **Punto no probado aún:** la base restaurada ya trae las filas de
   `storage.objects`; definir cómo subir los archivos sin chocar con ellas (p. ej. vía API S3 de Storage
   a la misma clave, o borrar esas filas y re-subir) y documentarlo.
5. Reactivar publicaciones de Realtime; revisar configuración de Auth (URLs de redirección, SMTP,
   plantillas) que no viaja en el dump.
6. Apuntar una copia **local** de la app a ese proyecto (sin tocar Vercel), entrar con un usuario real
   con su contraseña de siempre, abrir un paciente, una consulta y un estudio de Storage.
7. Medir el tiempo total (RTO real) y actualizar `docs/backup-restore.md` con todo lo aprendido.
8. **Borrar el proyecto de prueba** y los archivos descargados.

## 3. Otros pendientes de respaldo

- Borrar tras el 2026-11-23 los objetos `archivos/<bucket>/…` sin generación (frase vieja, ~48 MB).
- Actualizar acciones de GitHub de Node 20 a 24 (`actions/checkout`, `setup-node`, `upload-artifact`,
  `supabase/setup-cli`).
- Opcional: Ignored Build Step en Vercel para que cambios solo en `.github/`, `docs/` o `scripts/` no
  disparen despliegue.
- Opcional (más adelante): cifrado asimétrico con `age` para que GitHub solo tenga la llave pública.
