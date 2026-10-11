import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { responderError } from "@/lib/http";
import { registrarPago } from "@/lib/licitaciones/pagos";
import { requireUser } from "@/lib/session";
import { PagoSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * POST /api/licitaciones/[id]/pagos — registra un pago (requisito 6).
 *
 * Toda la lógica está en `registrarPago()`: estado `por_cobrar`, monto ≤ saldo, y
 * transición automática a `cobrada` cuando el saldo llega a cero.
 *
 * Este handler solo valida la forma del body con Zod y traduce errores. Cero reglas
 * de negocio acá.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await requireUser();
    const { id } = await params;

    const datos = PagoSchema.parse(await req.json());

    const resultado = await registrarPago(
      id,
      {
        monto: datos.monto,
        metodo: datos.metodo,
        referencia: datos.referencia,
        notas: datos.notas,
        fechaPago: datos.fechaPago,
      },
      { id: usuario.id, email: usuario.email },
    );

    return NextResponse.json({ data: resultado }, { status: 201 });
  } catch (e) {
    return responderError(e);
  }
}

/** GET — lista los pagos con el resumen de la cuenta. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;

    const licitacion = await prisma.licitacion.findUniqueOrThrow({
      where: { id },
      select: { montoFacturado: true, estado: true },
    });

    const pagos = await prisma.pago.findMany({
      where: { licitacionId: id },
      orderBy: { fechaPago: "desc" },
      include: { registradoPor: { select: { nombre: true, email: true } } },
    });

    const pagado = pagos.reduce((a, p) => a + p.monto, 0);

    return NextResponse.json({
      data: {
        pagos,
        totales: {
          facturado: licitacion.montoFacturado,
          pagado,
          saldo: licitacion.montoFacturado - pagado,
        },
      },
    });
  } catch (e) {
    return responderError(e);
  }
}
