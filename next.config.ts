import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Cache Components viene activado por defecto en Next 16, pero se desactiva a propósito acá.
   *
   * Por qué: con `cacheComponents: true`, leer la cookie de sesión fuera de un <Suspense> es un
   * ERROR DE BUILD, y los datos de Prisma no pasan por `fetch` (no los cubre `use cache` de forma
   * natural). En esta app el 100% de las páginas está detrás de autenticación, así que ninguna
   * se beneficia de un "static shell" prerenderizado: el shell igual tiene que esperar al request.
   *
   * Con el modelo clásico (este) conservamos `export const dynamic = 'force-dynamic'`, que el
   * endpoint del cron necesita para no devolver un JSON cacheado.
   */
  cacheComponents: false,
  partialPrefetching: false,

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
