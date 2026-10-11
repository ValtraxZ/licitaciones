import { NextResponse } from "next/server";
import { borrarSesion } from "@/lib/session";
import { responderError } from "@/lib/http";

/**
 * POST /api/auth/logout
 *
 * Borra la cookie de sesión. Es idempotente: si no hay sesión devuelve 200 igual,
 * para no filtrar por la respuesta si alguien estaba logueado o no.
 */
export async function POST() {
  try {
    await borrarSesion();
    return NextResponse.json({ data: { ok: true } });
  } catch (e) {
    return responderError(e);
  }
}
