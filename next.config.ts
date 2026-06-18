import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // La firma/sello del médico (≤2 MB) se sube por Server Action; sube el límite
    // por defecto (1 MB) para que quepa con el overhead de FormData.
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
