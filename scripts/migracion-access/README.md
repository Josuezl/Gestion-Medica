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

## Segunda clínica de Manuel — CNA (`migrate-cna.mjs`)

Manuel atendía además en una segunda clínica, **CNA**, cuya base llegó en
`Migracion /BD Manuel 2/Consulta/CONSULV4.MDB`. Sus pacientes y consultas se
incorporan al **mismo tenant** de Manuel, **deduplicando** contra lo ya migrado.

**Ejecutada el 2026-06-13 con éxito:** 520 pacientes de CNA (32 ya existían y se
reutilizaron, 488 nuevos) y 924 consultas. Tenant: 4,525 pacientes y 8,491
consultas en total. Verificación completa en verde e idempotente.

```bash
node migrate-cna.mjs            # dry-run
node migrate-cna.mjs --execute  # migra (idempotente)
node verify-cna.mjs             # verificación
```

Diferencias respecto a `migrate.mjs`:

- **Deduplicación nombre + fecha de nacimiento:** antes de crear un paciente se
  busca en el tenant uno con el mismo nombre normalizado (sin acentos, minúsculas)
  **y** la misma `birth_date`. Si coincide, las consultas de CNA se asocian a ese
  expediente existente (no se crea paciente ni se modifica). El teléfono no se usa
  para deduplicar porque está vacío en el 99.8% de CNA. Los casos de nombre igual
  pero fecha distinta se tratan como pacientes nuevos (evita fusiones erróneas).
- **Motivo de consulta:** `reason_for_visit = "Migrados de CNA"`.
- **IDs determinísticos** con prefijo `cna:` (`cna:pac:<IDPac>`, `cna:his:<IDHistoria>`)
  sobre el mismo namespace. Para garantizar idempotencia, los pacientes ya creados
  por CNA se excluyen del índice de deduplicación al re-ejecutar.
- Las consultas se fijan a `doctor_id` = Manuel. El resto del mapeo es idéntico.

## Fusión de pacientes duplicados (`merge-patients.mjs`)

Herramienta de limpieza para unir dos expedientes que son la misma persona pero
quedaron separados (la deduplicación automática no los detecta cuando el nombre
difiere, p. ej. un apellido de más). Reasigna todas las consultas/recetas/estudios/
citas del duplicado al principal, completa los campos vacíos del principal y borra
el duplicado.

```bash
# El PRIMER id es el que se conserva; el SEGUNDO el que se elimina.
# Acepta id completo o el id corto que muestra la app (ej. 167dd143).
node merge-patients.mjs <idConservar> <idEliminar>            # dry-run
node merge-patients.mjs <idConservar> <idEliminar> --execute  # fusiona
```

- **Validaciones:** ambos pacientes existen, son distintos y del **mismo tenant**
  (no fusiona entre clínicas). Antes de borrar, reconfirma que el duplicado quedó
  sin registros hijos.
- **Enriquecimiento:** rellena solo los campos vacíos del principal con los del
  duplicado (dirección, sexo, identidad, etc.) y fija `created_at` a la fecha más
  antigua de ambos. No concatena textos.
- **Idempotente:** si el id a eliminar ya no existe, no hace nada.
- Los archivos en Storage no se mueven (la RLS valida por `clinic_id`, no por
  `patient_id`, así que siguen accesibles).

Ejemplo ejecutado el 2026-06-13: se unió "Juan Carlos Vaquedano" en "Juan Carlos
Vaquedano Flores" (15 consultas en un solo expediente).
