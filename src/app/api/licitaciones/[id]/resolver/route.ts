import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errores } from "@/lib/errores";
import { responderError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { cambiarEstado } from "@/lib/transiciones";

export const dynamic = "force-dynamic";

/**
 * POST /api/licitaciones/[id]/resolver
 *
 * Resuelve una licitación `activa` como ganada o perdida, MANUALMENTE.
 *   activa → finalizada  (la empresa ganó y completó la entrega)
 *   activa → perdida     (no se ganó la licitación)
 *
 * La transición a `perdida` por VENCIMIENTO no pasa por acá: la hace el job programado.
 * Son dos caminos distintos hacia el mismo estado y el historial los distingue por `origen`.
 */

const BodySchema = z.object({
  resultado: z.enum(["finalizada", "perdida"], {
    message: 'El resultado debe ser "finalizada" o "perdida"',
  }),
  comentario: z.string().trim().max(500).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await requireUser();
    const { id } = await params;

    const body = BodySchema.parse(await req.json());

    const licitacion = await prisma.licitacion.findUnique({
      where: { id },
      select: { id: true, estado: true, codigo: true },
    });
    if (!licitacion) throw errores.noEncontrado("Licitación");

    // No tiene sentido resolver a mano una licitación que ya está cerrada: el job la
    // pasó a `perdida` por vencimiento y le estarías informing un resultado sobre
    // un proceso ya terminado.
    if (licitacion.estado !== "activa") {
      throw errores.conflicto(
        "ESTADO_INVALIDO",
        `Solo una licitación "activa" se puede resolver. Esta está en "${licitacion.estado}".`,
        { estado: licitacion.estado },
      );
    }

    const actualizada = await cambiarEstado({
      licitacionId: id,
      hacia: body.resultado,
      actor: { id: usuario.id, email: usuario.email },
      comentario:
        body.comentario ??
        (body.resultado === "finalizada"
          ? "Ganada: la empresa completó la entrega"
          : "No se ganó la licitación"),
    });

    return NextResponse.json({ data: actualizada });
  } catch (e) {
    return responderError(e);
  }
}
