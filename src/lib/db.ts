import { PrismaClient } from "@prisma/client";

/**
 * PrismaClient como singleton.
 *
 * Por qué: en desarrollo, Next.js recarga los módulos en cada cambio de archivo (HMR).
 * Sin guardar la instancia en `globalThis`, cada recarga crea un PrismaClient nuevo y
 * terminás con decenas de conexiones abiertas hasta que Postgres responde
 * `too many clients`. Es el patrón oficial recomendado por Prisma.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // En desarrollo logueamos los warnings (queries sin `select`, etc). En producción
    // solo errores, para no llenar los logs de Vercel con ruido.
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
