# Migración Access → Supabase (Centro Neurológico y Cardiovascular)

Script único que migró los expedientes históricos de los archivos `CONSULV4.MDB`
(Access 97/VB6, una base por doctor) al proyecto Supabase del tenant.
Se conserva como referencia y por si llega otro respaldo en el mismo formato.

**Ejecutada el 2026-06-12 con éxito:** 4,037 pacientes y 7,567 consultas
(Carol: 2,550 + 4,516 · Manuel: 1,487 + 3,051), verificación completa en verde.

## Uso

```bash
cd scripts/migracion-access
npm install
node migrate.mjs            # dry-run: solo reporte, no toca la BD
node migrate.mjs --execute  # migra (upsert idempotente: re-ejecutar no duplica)
node verify.mjs             # verificación post-migración
```

Requiere `.env.local` en la raíz del repo con `NEXT_PUBLIC_SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY`. Los archivos .mdb se esperan en la carpeta
`Migracion ` de la raíz (con espacio al final, así llegó del respaldo;
está en `.gitignore` porque contiene datos de pacientes).

## Decisiones de mapeo

- **Origen:** tabla `Identificacion` → `patients`; tabla `Historias` → `consultations`.
  Se descartan `Agenda`, `MKV`, `MU` y los catálogos `CIE10.MDB`/`FARMACOS.MDB`.
- **IDs determinísticos:** UUID v5 de `"<email-doctor>:pac:<IDPac>"` /
  `"<email-doctor>:his:<IDHistoria>"` con el namespace fijo del script
  (no cambiarlo nunca, o una re-ejecución duplicaría registros).
- **Separación por doctor:** los pacientes pertenecen a la clínica (modelo de la app);
  la asociación por doctor vive en `consultations.doctor_id`, fijado según el archivo origen.
- **Nombre** (campo único en Access) se divide: 4+ palabras → últimas 2 = apellidos;
  3 → 1 nombre + 2 apellidos; con coma → `"Apellidos, Nombres"`.
- **Nota clínica:** `HistoriaT` (texto plano) → `symptoms`; el campo `Historia` es la misma
  nota en RTF y solo se usa (con strip de RTF) cuando `HistoriaT` está vacía.
- **Fecha histórica:** `FechaDeLaHistoria + HoraDeLaHistoria` → `consultations.created_at`
  con offset `-06:00` (Honduras). `patients.created_at` = primera consulta del paciente.
- **Placeholders** para campos NOT NULL sin dato en el origen:
  - `birth_date` faltante → `1900-01-01`
  - `phone` vacío → `"No registrado"`; 8 dígitos → `+504XXXXXXXX`
  - `diagnosis`/`treatment_plan` vacíos → `"No registrado (migración)"`
  - `reason_for_visit` (no existe en Access) → `"Consulta histórica (migrada de Access)"`
- `Aseguradora`, `EdoCivil` y `Observaciones` se preservan etiquetados en
  `non_pathological_history`. `ProxCita`, `Foto`, `Aviso`, `Responsable` e
  `Imagenes` se descartan.

El script solo imprime conteos y estadísticas agregadas — nunca datos de pacientes.
