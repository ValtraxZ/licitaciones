import { PrismaClient } from "@prisma/client";

/**
 * PrismaClient como singleton.
 *
 * Por qué: en desarrollo, Next.js recarga los módulos en cada cambio de archivo (HMR).
 * Sin guardar la instancia en `globalThis`, cada recarga crea un PrismaClient nuevo y
 * terminás con decenas de conexiones abiertas hasta que Postgres responde
 * `too many clients`. Es el patrón oficial recomendado por Prisma.
 */

/**
 * Cuántas conexiones puede abrir ESTA instancia contra el pooler de Supabase.
 *
 * POR QUÉ 1 Y NO 5
 * ----------------
 * En Vercel cada instancia de serverless maneja UNA request y después se recicla, pero
 * varias conviven a la vez. Con `connection_limit=5`, cinco instancias ya son 25
 * conexiones, y el pooler de Supabase tiene un tope: cuando se pasa, TODOS los endpoints
 * que tocan la base empiezan a devolver 500 — login incluido — aunque la aplicación esté
 * perfectamente configurada. No avisa: simplemente deja de poder conectarse.
 *
 * Es el modo de falla más traicionero que hay, porque se ve como "la app se cayó" y en
 * realidad lo que se agotó fue el pool. Pasó en este proyecto: con la base respondiendo
 * perfecto en local, producción caía solo después de un rato de recibir tráfico.
 *
 * Una conexión por instancia es lo que recomienda Prisma cuando hay un pooler delante:
 * las requests de una instancia ya se serializan solas, así que un pool más grande solo
 * sirve para abrir más conexiones al mismo pooler compartido.
 */
const CONEXIONES_POR_INSTANCIA = 1;

/**
 * Ajusta la URL de conexión para limitar el pool.
 *
 * Se hace con concat y NO parseando con `new URL()` a propósito: el parser del navegador
 * normaliza y escapa el usuario y la contraseña, y un cambio de escapado ahí rompe la
 * autenticación contra el pooler. Agregar un parámetro de query es un cambio de texto
 * plano que no puede tocar las credenciales.
 *
 * Si la URL ya trae `connection_limit` (por ejemplo, alguien lo configuró a mano en el
 * panel de Vercel), se respeta: esta función solo pone el default.
 */
export function urlDeConexion(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Falla ruidosamente y en el arranque, no en la primera query: si el error aparece
    // recién cuando un usuario intenta loguearse, parece un bug de autenticación.
    throw new Error("DATABASE_URL no está definida en el entorno");
  }
  if (/[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=${CONEXIONES_POR_INSTANCIA}`;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: urlDeConexion(),
    // En desarrollo logueamos los warnings (queries sin `select`, etc). En producción
    // solo errores, para no llenar los logs de Vercel con ruido.
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
