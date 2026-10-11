import { NextResponse } from "next/server";
import { responderError } from "@/lib/http";
import { agregarProducto, detalleProductos } from "@/lib/licitaciones/productos";
import { requireUser } from "@/lib/session";
import { ItemProductoSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * POST /api/licitaciones/[id]/productos — agregar o actualizar un ítem.
 *
 * Aplica dos reglas del enunciado (viven en la capa de negocio, no acá):
 *   - Solo en `borrador` y `activa` → 409 en los otros 4 estados
 *   - El total no puede superar el presupuesto → 422
 *
 * Si el producto ya estaba, actualiza el ítem en vez de duplicarlo (la tabla puente
 * tiene `@@unique([licitacionId, productoId])`).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;

    const item = ItemProductoSchema.parse(await req.json());

    await agregarProducto(id, item);

    // Se devuelve el detalle recalculado para que el frontend no tenga que hacer un
    // segundo fetch solo para actualizar el total.
    return NextResponse.json({ data: await detalleProductos(id) }, { status: 201 });
  } catch (e) {
    return responderError(e);
  }
}

/** GET — lista los ítems con sus totales. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    return NextResponse.json({ data: await detalleProductos(id) });
  } catch (e) {
    return responderError(e);
  }
}
