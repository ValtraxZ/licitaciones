import { NextResponse } from "next/server";
import { responderError } from "@/lib/http";
import { detalleProductos, quitarProducto } from "@/lib/licitaciones/productos";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/licitaciones/[id]/productos/[itemId] — quita un producto.
 *
 * Solo permitido en `borrador` y `activa`: el mismo `assertEditable` que usa el alta.
 * Quitar un producto nunca puede violar el presupuesto (bajar el total siempre es seguro),
 * así que no hace falta revalidar el límite.
 *
 * `params` es un objeto con las dos partes del path dinámico; en Next 16 es una Promise.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    await requireUser();
    const { id, itemId } = await params;

    await quitarProducto(id, itemId);

    // Se devuelve el detalle recalculado para que el frontend actualice el total sin
    // un segundo fetch.
    return NextResponse.json({ data: await detalleProductos(id) });
  } catch (e) {
    return responderError(e);
  }
}
