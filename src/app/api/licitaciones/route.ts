import { NextResponse } from "next/server";
import type { EstadoLicitacion } from "@prisma/client";
import { prisma } from "@/lib/db";
import { responderError } from "@/lib/http";
import { crearLicitacion } from "@/lib/licitaciones/crear";
import { requireUser } from "@/lib/session";
import { LicitacionSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

const ESTADOS_VALIDOS = [
  "borrador", "activa", "finalizada", "por_cobrar", "cobrada", "perdida",
] as const;

/**
 * GET /api/licitaciones — listado con filtros.
 *
 * `estado` se valida contra la lista explícita: sin eso, un `?estado=inventado` llegaría
 * a Prisma y rechazaría con un error 500. Con la validación responde 422.
 */
export async function GET(req: Request) {
  try {
    await requireUser();

    const url = new URL(req.url);
    const estadoParam = url.searchParams.get("estado");
    const clienteId = url.searchParams.get("clienteId");
    const q = url.searchParams.get("q")?.trim();
    const pagina = Math.max(1, Number(url.searchParams.get("pagina") ?? 1) || 1);
    const porPagina = Math.min(100, Math.max(1, Number(url.searchParams.get("porPagina") ?? 25) || 25));

    if (estadoParam && !ESTADOS_VALIDOS.includes(estadoParam as EstadoLicitacion)) {
      return NextResponse.json(
        {
          error: {
            code: "ESTADO_INVALIDO",
            message: `Estado inválido. Válidos: ${ESTADOS_VALIDOS.join(", ")}`,
          },
        },
        { status: 422 },
      );
    }

    const where = {
      ...(estadoParam ? { estado: estadoParam as EstadoLicitacion } : {}),
      ...(clienteId ? { clienteId } : {}),
      ...(q
        ? {
            OR: [
              { titulo: { contains: q, mode: "insensitive" as const } },
              { codigo: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [licitaciones, total] = await Promise.all([
      prisma.licitacion.findMany({
        where,
        include: {
          cliente: { select: { id: true, nombre: true } },
          _count: { select: { productos: true, pagos: true, historial: true } },
        },
        orderBy: [{ fechaLimite: "asc" }, { creadoEn: "desc" }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      prisma.licitacion.count({ where }),
    ]);

    return NextResponse.json({
      data: licitaciones,
      paginacion: { pagina, porPagina, total, paginas: Math.ceil(total / porPagina) },
    });
  } catch (e) {
    return responderError(e);
  }
}

/**
 * POST /api/licitaciones — crea en estado `borrador`.
 *
 * El cliente NO puede elegir el estado: se fuerza `borrador` en la capa de negocio. Así
 * es imposible saltear el flujo (no podés crear una licitación ya "cobrada").
 */
export async function POST(req: Request) {
  try {
    const usuario = await requireUser();
    const datos = LicitacionSchema.parse(await req.json());

    const licitacion = await crearLicitacion(datos, {
      id: usuario.id,
      email: usuario.email,
    });

    return NextResponse.json({ data: licitacion }, { status: 201 });
  } catch (e) {
    return responderError(e);
  }
}
