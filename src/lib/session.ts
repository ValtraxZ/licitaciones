/**
 * SESIÓN: JWT en cookie httpOnly
 * ==============================
 *
 * POR QUÉ UN JWT A MANO Y NO `next-auth`
 * --------------------------------------
 * next-auth v5 sigue en beta y su flujo de credenciales con cookies es difícil de
 * defender en una entrevista ("¿cómo funciona?" → "lo configuré"). Acá son 40 líneas
 * de `jose` que se explican de punta a punta: firmás el token, lo guardás en cookie
 * httpOnly y lo verificás en cada request.
 *
 * El rol viaja DENTRO del token. Trade-off consciente: no se consulta la base en cada
 * request (más rápido), pero un cambio de rol tarda lo que dure la sesión en aplicarse.
 * Por eso `logout()` borra la cookie: si le cambiás el rol a alguien, que vuelva a entrar.
 */

import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { errores } from "./errores";
import type { Rol } from "./passwords";
import {
  COOKIE_SESION,
  DURACION_SESION_SEGUNDOS,
  firmarToken,
  verificarToken,
  type ClaimsSesion,
} from "./token";

export type Sesion = ClaimsSesion;
export { COOKIE_SESION };

/**
 * Opciones de la cookie. Cada flag previene un ataque distinto:
 *
 *   httpOnly  → XSS: un script inyectado en la página no puede leer la cookie.
 *   secure    → Secuestro de sesión en Wi-Fi público: solo viaja por HTTPS.
 *   sameSite  → CSRF: un formulario de otro sitio no puede hacer POST con tu sesión.
 *   maxAge    → Sesiones que nunca expiran.
 */
function opcionesCookie() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: DURACION_SESION_SEGUNDOS,
  };
}

/** Deja la cookie de sesión. Se llama desde el route handler de login. */
export async function setearSesion(datos: Sesion): Promise<void> {
  const token = await firmarToken(datos);
  (await cookies()).set(COOKIE_SESION, token, opcionesCookie());
}

export async function borrarSesion(): Promise<void> {
  (await cookies()).delete(COOKIE_SESION);
}

/** Lee y verifica la sesión actual. `null` si no hay cookie o no es válida. */
export async function getSession(): Promise<Sesion | null> {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  return verificarToken(token);
}

// ───────────────────────────── Guardas ─────────────────────────────

/** Exige sesión. Lanza 401 si no la hay. */
export async function requireUser(): Promise<Sesion> {
  const sesion = await getSession();
  if (!sesion) throw errores.noAutenticado();
  return sesion;
}

/**
 * Exige sesión de administrador. 401 sin sesión, 403 con sesión pero sin permiso.
 *
 * IMPORTANTE: va DENTRO de cada endpoint, aunque haya un proxy protegiendo la ruta.
 * El proxy es una optimización de UX (evita renderizar la página), no una frontera de
 * seguridad: si mañana exponés un endpoint sin página, el proxy no lo cubre.
 * Es defensa en profundidad.
 */
export async function requireAdmin(): Promise<Sesion> {
  const sesion = await requireUser();
  if (sesion.rol !== "ADMIN") throw errores.soloAdmin();
  return sesion;
}

/**
 * Variante para páginas: si no hay sesión, redirige al login en vez de tirar 401.
 *
 * `redirect()` está tipado como `never` (nunca retorna: lanza), por eso después de la
 * guarda TypeScript sabe que `sesion` es `Sesion` y no `Sesion | null`.
 */
export async function requireUserPagina(): Promise<Sesion> {
  const sesion = await getSession();
  if (!sesion) redirect("/login");
  return sesion;
}
