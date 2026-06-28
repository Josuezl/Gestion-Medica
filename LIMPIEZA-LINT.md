# Limpieza de ESLint — plan de trabajo

Documento de seguimiento para ir saldando la deuda de lint del repo **poco a poco**, en commits aparte (no mezclados con features).

- **Estado al 2026-06-27:** 248 hallazgos → **201 errores + 47 advertencias**.
- **No bloquean el build ni el deploy.** `npm run build` pasa con todos estos presentes (ESLint está desacoplado del build en este proyecto) y `npm test` pasa (50/50).
- **No son bugs de ejecución.** Son problemas de estilo / seguridad de tipos / buenas prácticas. Afectan mantenibilidad y el chequeo de TypeScript, no el funcionamiento para el usuario.

## Cómo revisar / medir

```bash
# usar el Node de nvm (este entorno no tiene Homebrew)
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"

npm run lint                 # listado completo
npm run lint -- --fix        # auto-arregla lo que sea auto-arreglable (¡revisar el diff!)
```

Conteo por regla:
```bash
npm run lint 2>&1 | grep -oE "@typescript-eslint/[a-z-]+|react-hooks/[a-z-]+|next/[a-z-]+" | sort | uniq -c | sort -rn
```

> ⚠️ No correr `npm run build` con `npm run dev` vivo (desincroniza `.next` → "Hydration failed"). Apagar el dev antes de compilar.

## Resumen por regla

| Cant. | Severidad | Regla | Qué es | Riesgo real |
|------:|-----------|-------|--------|-------------|
| 186 | error | `@typescript-eslint/no-explicit-any` | Uso del tipo `any` | Apaga el chequeo de tipos en ese punto. No rompe nada hoy; el riesgo es que un bug futuro se cuele sin aviso de TS. |
| 43 | warning | `@typescript-eslint/no-unused-vars` | Imports/variables sin usar | Código muerto. Inofensivo. |
| 7 | error | `react-hooks/set-state-in-effect` | `setState` dentro de `useEffect` | Posibles re-renders en cascada. En los debounce actuales funciona bien. |
| 5 | error | `next/no-html-link-for-pages` | `<a>` en vez de `<Link>` | Navegación interna sin prefetch/SPA (recarga completa). Solo rendimiento. |
| 4 | warning | `next/no-img-element` | `<img>` en vez de `next/image` | Imágenes sin optimizar (peso/LCP). Solo rendimiento. |
| 3 | error | `react-hooks/purity`, `react-hooks/static-components` | Llamadas impuras en render / componentes redefinidos | Reglas nuevas de React. Revisar caso por caso; hoy no hay falla visible. |

## Archivos con más hallazgos

| Cant. | Archivo |
|------:|---------|
| 30 | `app/dashboard/patients/[id]/PatientDetailsClient.tsx` |
| 19 | `app/dashboard/components/PatientHistoryTabs.tsx` |
| 15 | `app/dashboard/config/ConfigClient.tsx` |
| 13 | `app/dashboard/reports/ReportsClient.tsx` |
| 13 | `app/dashboard/consultations/new/NewConsultationClient.tsx` |
| 12 | `app/dashboard/AgendaClient.tsx` |
| 9 | `app/dashboard/patients/actions.ts` |
| 9 | `app/dashboard/config/StudyCatalogCard.tsx` |
| 8 | `app/dashboard/consultations/new/page.tsx` |
| 8 | `app/dashboard/config/LabCatalogCard.tsx` |

(El resto, ≤7 c/u, repartido en ~40 archivos: `utils/email*.ts`, `utils/whatsapp.ts`, `utils/auth-guard.ts`, páginas de impresión, etc.)

## Plan por fases (de menor a mayor riesgo)

### Fase 1 — Quick wins sin riesgo  ✅ recomendado primero
- [ ] `no-unused-vars` (43): borrar imports/variables sin usar. Cero cambio de comportamiento. Mucho se arregla con `npm run lint -- --fix`.
- [ ] `no-img-element` (4): cambiar `<img>` por `next/image` donde aplique (ojo con logos/markup de impresión, ahí a veces conviene dejar `<img>` y silenciar la regla puntualmente).

### Fase 2 — Buenas prácticas de Next/React
- [ ] `no-html-link-for-pages` (5): `<a href="/ruta">` → `<Link href="/ruta">` para navegación interna. Verificar que no rompa rutas que dependen de recarga completa.
- [ ] `set-state-in-effect` (7): revisar cada `useEffect`. Los debounce (búsqueda de pacientes/historial) se pueden dejar; donde sea estado derivado, mover a `useMemo` o calcular en render.
- [ ] `react-hooks/purity` + `static-components` (3): revisar caso por caso (p. ej. `new Date(Date.now()...)` en render de `AppointmentCard`; definir componentes fuera del render).

### Fase 3 — Tipado de `any` (el grueso: 186)
Hacer **por área**, un commit por carpeta, compilando y probando entre cada uno:
- [ ] `utils/` (auth-guard, email, email-invitation, whatsapp, pdf-generator, ensureStudyCatalog) — son utilidades críticas; empezar aquí da el mayor valor de seguridad de tipos.
- [ ] `app/dashboard/patients/` (PatientDetailsClient, actions, tabs)
- [ ] `app/dashboard/config/` (ConfigClient, StudyCatalogCard, LabCatalogCard)
- [ ] `app/dashboard/consultations/` y `reports/`
- [ ] Resto de páginas de impresión y rutas API.

**Cómo tipar los `any` de Supabase:** la mayoría viene de resultados de consultas. Opciones, de mejor a peor:
1. Generar/usar los tipos de la base (`supabase gen types typescript`) y tipar las consultas.
2. Definir `interface`/`type` locales para la forma que se usa.
3. Como último recurso, `unknown` + validación, o silenciar la línea con un comentario justificado.

## Reglas de trabajo

1. **Un commit por fase/área**, nunca mezclado con una feature.
2. Tras cada lote: `npm run build` **y** `npm test` deben pasar.
3. Para `--fix`, **revisar siempre el diff** antes de commitear (puede tocar más de lo esperado).
4. Meta realista: bajar los **errores** primero (los 201), dejar las advertencias para el final.
