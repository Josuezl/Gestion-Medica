import type { MetadataRoute } from 'next'

// app.cloudmedhn.com es la aplicación privada (no la web de marketing).
// Se desindexa por completo para que los buscadores no indexen el panel ni las
// páginas públicas que muestran datos por código (recetas/verificación).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  }
}
