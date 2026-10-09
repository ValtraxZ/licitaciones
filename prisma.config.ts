import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Configuración de Prisma (reemplaza la clave `prisma` en package.json, deprecada en Prisma 7).
 *
 * Nota importante sobre el entorno:
 *  1. El CLI de Prisma solo lee `.env`, NO `.env.local`. Next.js lee ambos (y prioriza
 *     `.env.local`). Por eso este proyecto usa un único `.env` que los dos consumen, y así
 *     se evita la trampa de "la app anda pero `prisma db push` dice que falta DIRECT_URL".
 *  2. Al usar `prisma.config.ts`, Prisma deja de cargar variables de entorno por su cuenta
 *     (log: "Prisma config detected, skipping environment variable loading"), por eso el
 *     `import "dotenv/config"` de arriba es obligatorio.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
