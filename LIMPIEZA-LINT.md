# Limpieza de ESLint — COMPLETADA ✅

Documento de seguimiento de la deuda de lint del repo. **Saldada por completo el 2026-07-03.**

- **Estado inicial (2026-06-27):** 248 hallazgos. Al retomar (2026-07-03): 269 (222 errores + 47 advertencias).
- **Estado final (2026-07-03):** **0 hallazgos.** `npm run lint` pasa limpio.
- `npm run build` pasa, `npm test` pasa (110/110) y se verificó E2E con puppeteer (8/8 flujos, sin errores de página).

## Cómo revisar / medir

```bash
# usar el Node de nvm (este entorno no tiene Homebrew)
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"

npm run lint                 # ahora pasa sin salida de errores
```

> ⚠️ No correr `npm run build` con `npm run dev` vivo (desincroniza `.next` → "Hydration failed"). Apagar el dev antes de compilar.

## Qué se hizo (en commits separados, no mezclados con features)

### Fase 1 — Quick wins  ✅
- `no-unused-vars` (43): se borraron imports/variables sin usar y código muerto (handlers de copiar-al-portapapeles que ya no se usaban). De paso, la agenda dejó de precargar hasta 5000 pacientes: la lista solo se usaba como tipo (la búsqueda ya corre server-side con `searchPatientsForAgenda`).
- `no-img-element` (4): el logo de la app usa `next/image` (login + sidebar). Se dejó `<img>` con `eslint-disable` justificado para firmas de Storage (URL dinámica por tenant) y el markup de impresión.
- Commit: `refactor(lint): remove unused imports/dead code and optimize images`

### Fase 2 — Buenas prácticas de Next/React  ✅
- `no-html-link-for-pages` (5): `<a href>` interno → `<Link>`.
- `set-state-in-effect` (8): `CodeForm`/`DocumentCodeGate` usan `useTransition`; `AgendaClient` deriva "buscando"/resultados de la última query cargada en vez de hacer `setState` dentro del debounce; `patients/new` lee `?nombre=` con `useSearchParams` (envuelto en `Suspense`); hook compartido `useAppOrigin` (`useSyncExternalStore`) reemplaza el `setAppUrl` en efecto.
- `react-hooks/purity` + `static-components` (3): `AppointmentCard` reutiliza `calculateAge` de `utils/age` (sin `Date.now()` en render); `ProfileClient` sube `MsgBox` fuera del cuerpo del componente.
- Commit: `refactor(react): fix effect/purity/static-component and internal link issues`

### Fase 3 — Tipado de `any` (206) ✅
Se creó `utils/clinicalTypes.ts` con las formas de fila del dominio (paciente, consulta, receta, estudios, órdenes de lab, solicitudes, incapacidades, referencias, signos pre-clínicos, documentos con membrete) y helpers compartidos (`DoctorRef`, `ShareableDoc`). Son tipos a mano, deliberadamente laxos (casi todo opcional/nullable) para tolerar el drift repo↔BD. Hecho por área, un commit por carpeta, compilando y probando entre cada uno:
- `utils/` — `refactor(types): replace any with proper types in utils/`
- `app/dashboard/patients/` — `refactor(types): type the patients area with shared clinical row types`
- `app/dashboard/config/` + perfil — `refactor(types): type the config and profile areas`
- `consultations/` + `reports/` — `refactor(types): type the consultations and reports areas`
- Resto (impresión pública, API, agenda, solicitudes) — `refactor(types): type remaining any across public docs, API and agenda`

**Nota sobre los joins de Supabase:** las relaciones a-uno (`patients(...)`, `user_profiles(...)`, `clinics(...)`) las infiere el cliente como arreglo. Donde hizo falta se usó un cast `as unknown as <Tipo>` con comentario, en vez de `any`.

## Reglas de trabajo (se respetaron)
1. Un commit por fase/área, nunca mezclado con una feature.
2. Tras cada lote: `npm run build` **y** `npm test` pasaron.
3. `--fix` no aplicaba a estas reglas (todo fue manual y revisado).
