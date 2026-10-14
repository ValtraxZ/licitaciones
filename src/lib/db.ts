import { PrismaClient } from "@prisma/client";

/**
 * PrismaClient como singleton, con el pool acotado y reintentos ante fallos de conexión.
 *
 * Por qué singleton: en desarrollo, Next.js recarga los módulos en cada cambio de archivo
 * (HMR). Sin guardar la instancia en `globalThis`, cada recarga crea un PrismaClient nuevo
 * y terminás con decenas de conexiones abiertas hasta que Postgres responde
 * `too many clients`. Es el patrón oficial recomendado por Prisma.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Cuántas conexiones puede abrir ESTA instancia contra el pooler de Supabase.
 *
 * POR QUÉ 1 Y NO 5
 * ----------------
 * En Vercel cada instancia de serverless maneja una request y después se recicla, pero
 * varias conviven a la vez. Con `connection_limit=5`, cinco instancias ya son 25
 * conexiones, y el pooler de este proyecto tiene un tope cercano a 4.
 */
const CONEXIONES_POR_INSTANCIA = 1;

/**
 * Ajusta la URL de conexión para limitar el pool.
 *
 * Se hace con concat y NO parseando con `new URL()` a propósito: el parser normaliza y
 * escapa el usuario y la contraseña, y un cambio de escapado ahí rompe la autenticación
 * contra el pooler. Agregar un parámetro de query es un cambio de texto plano que no
 * puede tocar las credenciales.
 *
 * Si la URL ya trae `connection_limit` (por ejemplo, porque alguien lo configuró a mano
 * en el panel de Vercel), se respeta: esta función solo pone el default.
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

/**
 * Códigos de Prisma que describen un problema de CONEXIÓN, no de datos.
 *
 * La diferencia importa: un `P2002` (unique violated) es una respuesta definitiva de la
 * base y reintentarlo no lo va a cambiar, pero un `P1001` (no se pudo alcanzar el
 * servidor) muchas veces es solo un instante en que el pooler estaba saturado. Reintentar
 * a ciegas convertiría un 409 correcto en un 500 y, peor, taparía el error real.
 */
const ERRORES_TRANSITORIOS = new Set([
  "P1001", // no se pudo establecer la conexión
  "P1002", // el servidor alcanzó el timeout de conexión
  "P1008", // la operación tardó demasiado
  "P1010", // el usuario fue rechazado
  "P1011", // error de TLS al abrir la conexión
  "P1017", // el servidor cerró la conexión inesperadamente
  "P2024", // se agotó el pool de conexiones del cliente
  "P2028", // la API de transactions expiró
]);

/** ¿Este error se debe a la conexión y vale la pena reintentarlo? */
export function esErrorTransitorio(e: unknown): boolean {
  // Prisma envuelve los fallos de conexión en distintas clases según si se pudo
  // inicializar el cliente, si falló la query o si la transacción venció.
  const nombre = (e as { constructor?: { name?: string } })?.constructor?.name ?? "";
  if (nombre === "PrismaClientInitializationError" || nombre === "PrismaClientRustPanicError") {
    return true;
  }
  const codigo = (e as { code?: string })?.code;
  return typeof codigo === "string" && ERRORES_TRANSITORIOS.has(codigo);
}

const ESPERA_BASE_MS = 80;
const INTENTOS_MAXIMOS = 4;

/**
 * Reintenta una operación cuando falla por conexión.
 *
 * POR QUÉ REINTENTAR Y NO SOLO BAJAR EL POOL
 * -------------------------------------------
 * El pooler admite unas 4 conexiones simultáneas. Vercel levanta una instancia de
 * serverless por request concurrente, así que con 5 requests al mismo tiempo hay 5
 * clientes pidiendo 4 conexiones: siempre hay al menos una que se queda afuera. Medido
 * contra el deploy real, con 5 requests simultáneos fallaba 1 de cada 5.
 *
 * Las conexiones se liberan solas —con tráfico secuencial la app no se cae nunca—, así
 * que esperar un poco y volver a intentar sí alcanza. El costo es latencia en el peor
 * caso; la alternativa es un 500 que el usuario ve como "la aplicación está caída".
 *
 * El backoff es exponencial y lleva algo de azar: si las requests que compiten reintentaran
 * todas en el mismo milisegundo, volverían a chocar entre ellas para siempre.
 */
export async function conReintentos<T>(operacion: () => Promise<T>): Promise<T> {
  let ultimoError: unknown;
  for (let intento = 1; intento <= INTENTOS_MAXIMOS; intento++) {
    try {
      return await operacion();
    } catch (e) {
      if (!esErrorTransitorio(e) || intento === INTENTOS_MAXIMOS) throw e;
      ultimoError = e;
      const espera = ESPERA_BASE_MS * 2 ** (intento - 1);
      await new Promise((r) => setTimeout(r, espera + Math.random() * ESPERA_BASE_MS));
    }
  }
  throw ultimoError;
}

const cliente = new PrismaClient({
  datasourceUrl: urlDeConexion(),
  // En desarrollo logueamos los warnings (queries sin `select`, etc). En producción
  // solo errores, para no llenar los logs de Vercel con ruido.
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

/**
 * Cliente con reintentos en TODAS las operaciones.
 *
 * Se hace con `$extends` y no envolviendo cada endpoint a mano: así el reintento cubre
 * también las queries anidadas dentro de `$transaction`, y no queda ningún endpoint
 * viejo sin él, que es como se cuelan bugs de este tipo.
 *
 * La anotación de tipo es necesaria: `$extends` devuelve un tipo propio y, aunque en
 * tiempo de ejecución el cliente extendido tiene todo lo que tiene el original
 * (incluido `$transaction`), TypeScript no lo reconoce y `pagos.ts` — que pasa el
 * cliente a una transacción — deja de compatibilizar. El cast documenta que la
 * diferencia es de tipos, no de comportamiento.
 */
export const prisma: PrismaClient = cliente.$extends({
  name: "con-reintentos",
  query: {
    $allOperations({ args, query }) {
      return conReintentos(() => query(args));
    },
  },
}) as unknown as PrismaClient;

// Se guarda el cliente BASE en globalThis, no el extendido: el extendido es un proxy
// liviano y guardarlo entre recargas de HMR acumularía capas de reintento anidadas.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = cliente;
