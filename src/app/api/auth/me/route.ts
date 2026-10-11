import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { responderError } from "@/lib/http";

/**
 * GET /api/auth/me
 *
 * Devuelve la sesión actual o `null`. Lo usa el header de la app para mostrar nombre y
 * rol, y para el botón de logout.
 *
 * Devuelve 200 con `data: null` en vez de 401 a propósito: "no hay sesión" es un estado
 * normal de la UI, no un error.
 */
export async function GET() {
  try {
    return NextResponse.json({ data: await getSession() });
  } catch (e) {
    return responderError(e);
  }
}
