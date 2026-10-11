import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { responderError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { ClienteSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * GET /api/clientes — listado.
 *
 * Cualquier usuario autenticado puede ver clientes. Solo los ADMIN pueden crear
 * usuarios, pero los clientes los crea cualquiera: el enunciado reserva la
 * restricción de rol únicamente para la creación de usuarios.
 *
 * `_count` es un GROUP BY resuelto por Prisma en una sola query. Mostrar "cuántas
 * licitaciones tiene" con N+1 (una query por cliente) es lo que separa un listado
 * usable de uno lento.
 */
export async function GET(req: Request) {
  try {
    await requireUser();

    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();

    const clientes = await prisma.cliente.findMany({
      where: q
        ? {
            OR: [
              { nombre: { contains: q, mode: "insensitive" } },
              { razonSocial: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      include: { _count: { select: { licitaciones: true } } },
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ data: clientes });
  } catch (e) {
    return responderError(e);
  }
}

/** POST /api/clientes — creación. */
export async function POST(req: Request) {
  try {
    const usuario = await requireUser();
    const datos = ClienteSchema.parse(await req.json());

    // El email identifica a la empresa cliente y es a donde se mandan las propuestas.
    // Se valida que sea un email real antes de guardar (ya lo hace Zod con z.email()).
    const cliente = await prisma.cliente.create({
      data: {
        ...datos,
        creadoPorId: usuario.id,
      },
    });

    return NextResponse.json({ data: cliente }, { status: 201 });
  } catch (e) {
    return responderError(e);
  }
}
