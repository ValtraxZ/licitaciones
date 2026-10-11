import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errores } from "@/lib/errores";
import { responderError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { ProductoSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/** GET /api/productos — catálogo. Cualquier usuario autenticado. */
export async function GET(req: Request) {
  try {
    await requireUser();

    const url = new URL(req.url);
    const incluirInactivos = url.searchParams.get("inactivos") === "true";

    const productos = await prisma.producto.findMany({
      where: incluirInactivos ? undefined : { activo: true },
      include: { _count: { select: { licitaciones: true } } },
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ data: productos });
  } catch (e) {
    return responderError(e);
  }
}

/** POST /api/productos — alta de catálogo. */
export async function POST(req: Request) {
  try {
    const usuario = await requireUser();
    const datos = ProductoSchema.parse(await req.json());

    // El sku es la clave natural del producto. Se chequea acá para devolver un 409 con
    // un mensaje claro en vez de un 500 genérico de constraint violado.
    const existente = await prisma.producto.findUnique({
      where: { sku: datos.sku },
      select: { id: true, nombre: true },
    });
    if (existente) {
      throw errores.conflicto("SKU_EN_USO", `Ya existe un producto con el SKU ${datos.sku}`, {
        producto: existente,
      });
    }

    const producto = await prisma.producto.create({
      data: { ...datos, creadoPorId: usuario.id },
    });

    return NextResponse.json({ data: producto }, { status: 201 });
  } catch (e) {
    return responderError(e);
  }
}
