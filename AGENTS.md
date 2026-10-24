<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Despliegue y guardados

- Antes de tocar SQL, Server Actions o rutas `/api/guardar/...`, lee `docs/despliegue-sin-errores.md` (SQL aditivo antes del push; quitar/renombrar en un despliegue posterior; las rutas de guardado solo crecen).
- Desarrollo diario contra Supabase local: `npm run dev` (ver README, «Desarrollo local»). `npm run dev:nube` toca la base real.
