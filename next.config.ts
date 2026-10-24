import type { NextConfig } from "next";
import { SIN_VERSION } from "./utils/appVersion";

const nextConfig: NextConfig = {
  // Commit del build en el bundle del navegador; se compara con public/version.json
  // (scripts/write-version.mjs) para avisar a las pestañas abiertas de una versión nueva.
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA || SIN_VERSION,
  },
  experimental: {
    // La firma/sello del médico (≤2 MB) se sube por Server Action; sube el límite
    // por defecto (1 MB) para que quepa con el overhead de FormData.
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
