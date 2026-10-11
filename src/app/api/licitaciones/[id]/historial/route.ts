import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { responderError } from "@/lib/http";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/licitaciones/[id]/historial
 *
 * Requisito 7: toda transición queda registrada con estado anterior, estado nuevo,
 * usuario y fecha/hora. Este endpoint es la consulta de auditoría.
 *
 * Se ordena de más reciente a más antigua porque así se muestra en el detalle: lo
 * último que pasó es lo primero que se lee.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;

    const historial = await prisma.historialTransicion.findMany({
      where: { licitacionId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        estadoAnterior: true,
        estadoNuevo: true,
        origen: true,
        usuarioId: true,
        usuarioEmail: true,
        comentario: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      data: historial,
      // `transicionesAutomaticas` sirve para la evidencia: demuestra que el sistema
      // transitioned una licitación sin intervención humana.
      resumen: {
        total: historial.length,
        automaticas: historial.filter((h) => h.origen !== "manual").length,
        manuales: historial.filter((h) => h.origen === "manual").length,
      },
    });
  } catch (e) {
    return responderError(e);
  }
}
