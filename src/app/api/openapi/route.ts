import { NextResponse } from "next/server";
import { openapi } from "@/lib/openapi";

export const dynamic = "force-dynamic";

/**
 * GET /api/openapi
 *
 * Sirve la especificación OpenAPI. Está definida en `src/lib/openapi.ts` (código, no YAML)
 * para que no pueda quedar desactualizada respecto de los schemas de Zod y Prisma.
 *
 * Es pública a propósito: la documentación tiene que poder consultarse sin iniciar sesión.
 * Publicar un spec no filtra nada que la propia app no muestre ya.
 *
 * Se puede descargar y pegar en Postman o Insomnia.
 */
export async function GET() {
  return NextResponse.json(openapi, {
    headers: {
      "Content-Disposition": 'inline; filename="licitaciones-openapi.json"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
