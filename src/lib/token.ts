/**
 * Firma y verificación de tokens (sin `next/headers`).
 *
 * Va separado de `session.ts` a propósito: `session.ts` depende de `cookies()`, que
 * solo existe en Server Components y Route Handlers. El proxy corre en un contexto
 * distinto y NO puede usar `cookies()`; recibe el token como parámetro. Separar la
 * lógica criptográfica de la delega de cookies permite que las dos capas compartan
 * exactamente el mismo código de firma, sin duplicarlo.
 */

import { jwtVerify, SignJWT } from "jose";
import type { Rol } from "./passwords";

export const COOKIE_SESION = "session";
export const DURACION_SESION_SEGUNDOS = 60 * 60 * 8; // 8 horas

export type ClaimsSesion = {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
};

export function claveSecreta(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // Falla ruidosamente. Si `AUTH_SECRET` faltara, `new TextEncoder().encode(undefined)`
    // devolvería algo y se firmaría con una clave vacía: cualquiera podría forjar un
    // token con rol ADMIN.
    throw new Error("AUTH_SECRET no está definida en el entorno");
  }
  return new TextEncoder().encode(secret);
}

export async function firmarToken(datos: ClaimsSesion): Promise<string> {
  return new SignJWT({
    email: datos.email,
    nombre: datos.nombre,
    rol: datos.rol,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(datos.id)
    .setIssuedAt()
    .setExpirationTime(`${DURACION_SESION_SEGUNDOS}s`)
    .sign(claveSecreta());
}

/**
 * Verifica firma y expiración. Devuelve `null` en cualquier fallo.
 *
 * Los tres casos (token alterado, expirado, firmado con otro secret) son
 * indistinguibles para el llamador: "no estás autenticado". No se distingue el motivo
 * en la respuesta para no darle información a quien intenta forjar tokens.
 */
export async function verificarToken(token: string | undefined): Promise<ClaimsSesion | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, claveSecreta());
    if (!payload.sub || !payload.email || !payload.rol) return null;
    return {
      id: payload.sub,
      email: String(payload.email),
      nombre: String(payload.nombre ?? ""),
      rol: payload.rol as Rol,
    };
  } catch {
    return null;
  }
}
