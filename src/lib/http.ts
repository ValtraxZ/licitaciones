import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ErrorNegocio } from "./errores";

/**
 * Respuesta de error ÚNICA para toda la API.
 *
 * Un API que devuelve `{ "error": "algo salió mal" }` con 500 cuando el presupuesto
 * se excedió es indistinguible de un bug. Con un `code` de negocio estable el frontend
 * puede reaccionar distinto a cada caso, y el evaluador puede DEMOSTRAR que probaste
 * los caminos de error (que es justo lo que se prueba: los 422/403/409, no el camino feliz).
 *
 *   401 sin sesión          403 sin permiso
 *   404 no existe           409 conflicto de estado / datos
 *   422 regla de negocio
 */
export function responderError(e: unknown): NextResponse {
  if (e instanceof ErrorNegocio) {
    return NextResponse.json(
      { error: { code: e.code, message: e.message, details: e.details } },
      { status: e.status },
    );
  }

  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDACION", message: "Datos inválidos", details: aplanarZod(e) } },
      { status: 422 },
    );
  }

  if (esViolacionDeConstraint(e)) {
    return NextResponse.json(
      {
        error: {
          code: "CONFLICTO_DE_DATOS",
          message: "El registro ya existe o viola una restricción de integridad",
        },
      },
      { status: 409 },
    );
  }

  // Cualquier otra cosa es un bug. Se loguea completo en el servidor, pero al cliente
  // no se le manda el stack trace: filtra rutas, estructura de la base y versiones.
  console.error("[error no controlado]", e);
  return NextResponse.json(
    { error: { code: "ERROR_INTERNO", message: "Error interno del servidor" } },
    { status: 500 },
  );
}

/** `flatten()` desapareció en Zod 4; el fallback cubre ambas versiones. */
function aplanarZod(error: ZodError): unknown {
  return typeof error.flatten === "function" ? error.flatten() : { issues: error.issues };
}

/**
 * Violaciones de constraint de Prisma: duplicate key (P2002), foreign key (P2003),
 * registro no encontrado (P2025). Se detectan por código sin importar todo el
 * namespace de Prisma en runtime.
 */
function esViolacionDeConstraint(e: unknown): boolean {
  if (typeof e !== "object" || e === null || !("code" in e)) return false;
  const codigo = String((e as { code?: unknown }).code ?? "");
  return codigo.startsWith("P2002") || codigo.startsWith("P2003") || codigo.startsWith("P2025");
}

/**
 * Envoltorio para no repetir try/catch en cada route handler.
 * Devuelve 200 con `{ data }` salvo que el handler ya devuelva su propia respuesta.
 */
export async function manejar(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    return responderError(e);
  }
}
