import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errores } from "@/lib/errores";
import { responderError } from "@/lib/http";
import { facturar } from "@/lib/licitaciones/pagos";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/licitaciones/[id]/facturar — finalizada → por_cobrar.
 *
 * `montoFacturado` es opcional: si no se manda, se factura el total de los productos.
 *
 * Por qué es un campo APARTE de `totalProductos`: se puede presupuestar $1.000.000 y
 * facturar $950.000 con un descuento negociado. Si el monto facturado fuera siempre igual
 * al total, no se podría modelar una negociación, y el requisito 6 ("total facturado
 * menos la suma de pagos") no tendría sentido.
 */
const BodySchema = z.object({
  montoFacturado: z
    .int("El monto facturado debe ser un entero en centavos")
    .positive("El monto facturado debe ser mayor a cero")
    .optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await requireUser();
    const { id } = await params;

    const body = BodySchema.parse(await req.json());

    const licitacion = await prisma.licitacion.findUnique({
      where: { id },
      select: { totalProductos: true },
    });
    if (!licitacion) throw errores.noEncontrado("Licitación");

    const monto = body.montoFacturado ?? licitacion.totalProductos;

    const actualizada = await facturar(id, monto, {
      id: usuario.id,
      email: usuario.email,
    });

    return NextResponse.json({ data: actualizada });
  } catch (e) {
    return responderError(e);
  }
}
