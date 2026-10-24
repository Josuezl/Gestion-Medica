# Desplegar sin errores (Supabase + Vercel)

`main` despliega directo a producción en Vercel (Hobby, sin Skew Protection) y el SQL se corre a
mano en Supabase. Durante unos minutos conviven código viejo y nuevo, y base vieja y nueva. Estas
reglas evitan que alguien con la pantalla abierta pierda lo que estaba guardando.

## Qué ya protege la app

- **Aviso de versión nueva:** cada pestaña compara su versión con `/version.json`. Al navegar se
  recarga sola; si hay un formulario a medias, avisa y «Actualizar» conserva lo escrito.
- **Guardados críticos por rutas fijas:** consulta, cita (crear/editar) y paciente (crear/editar)
  usan `/api/guardar/...`, que tienen la misma dirección en todos los builds. Una pestaña abierta
  antes del despliegue sigue guardando.
- **El resto usa Server Actions:** sus ids cambian cuando Vercel regenera la caché del build (hasta
  14 días). Desde una pestaña vieja fallan; el aviso y la red de formularios lo amortiguan.

## Reglas

1. **SQL que solo agrega va ANTES del push** (tablas, columnas nulas o con valor por defecto,
   índices, funciones nuevas). Por qué: el código viejo ignora lo nuevo y sigue funcionando.
2. **SQL que quita o renombra va en un despliegue POSTERIOR**, cuando ningún código en producción lo
   usa. Renombrar = agregar la nueva, copiar datos, cambiar el código, desplegar, y recién después
   borrar la vieja. Por qué: el código viejo sigue vivo en pestañas abiertas y en funciones calientes.
3. **Las rutas `/api/guardar/...` solo crecen:** campos nuevos opcionales; renombrar o quitar, en un
   despliegue posterior. Por qué: si cambian, las pestañas viejas vuelven a fallar al guardar. Un
   formulario nuevo e importante debe nacer con ruta de API, no con Server Action.
4. **Desplegar fuera de horario de clínica** cuando el cambio toca agenda o consultas. Por qué: es
   donde hay más pantallas abiertas con datos a medias.
5. **Lista antes de fusionar a `main`:**
   - [ ] CI en verde (lint, pruebas, build).
   - [ ] SQL aditivo aplicado en Supabase.
   - [ ] Push / merge a `main`.
   - [ ] Abrir producción y confirmar que `/version.json` muestra el commit nuevo.
6. **Cuándo pasar a Vercel Pro:** Skew Protection mantiene la versión vieja viva 12 h para las
   pestañas abiertas, y Hobby no permite uso comercial. Por qué esperar: hoy las reglas 1–5 y las
   rutas fijas cubren lo crítico sin costo.

## Previews de Vercel: NO sirven para probar guardados

Revisado el 2026-10-23 con `vercel env ls` (solo nombres; los valores no se leyeron):

| Variable | Entornos |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Production y Preview (dos valores separados) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Preview + Production (el mismo) |
| `SUPABASE_SERVICE_ROLE_KEY` | Preview + Production (el mismo) |
| `RESEND_API_KEY` | Preview + Production (el mismo) |

Una clave de Supabase solo funciona con su propio proyecto. Si las previews comparten las claves de
producción, o apuntan a la base de producción, o no funcionan. Además mandan correos reales.

**Propuesta (no aplicada):** usar el segundo proyecto gratis de Supabase solo para previews, con
sus propias claves, y dejar `RESEND_API_KEY` vacía en Preview. Mientras tanto, las pruebas se hacen
en local (`npm run dev`, Supabase en Docker) o con las E2E.
