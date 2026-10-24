This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Desarrollo local

`npm run dev` usa una Supabase **local** en Docker, nunca la base real. Correo, WhatsApp e IA quedan apagados.

1. `npm run db:local`: levanta Supabase (la primera vez baja las imágenes).
2. `npm run db:reset && npm run db:sembrar`: esquema + datos inventados + usuarios `medico@e2e.test`, `asistente@e2e.test` y `admin@e2e.test` (contraseña `E2e-Prueba-2026!`).
3. `npm run dev`: la app en http://localhost:2000 contra la base local. `npm run db:parar` la apaga.

`npm run dev:nube` usa `.env.local` (base REAL): solo a propósito.
El esquema sale de `supabase/migrations/20261023000000_esquema_base.sql` (dump sin datos); las migraciones anteriores quedan como historial en `supabase/migraciones-anteriores/`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
