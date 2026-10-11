import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errores } from "@/lib/errores";
import { responderError } from "@/lib/http";
import { hashPassword } from "@/lib/passwords";
import { requireUser } from "@/lib/session";
import { CrearUsuarioSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * GET /api/usuarios — listado.
 *
 * `select` explícito y SIN `passwordHash`. El hash nunca debe viajar al cliente, ni
 * siquiera por descuido de un `return usuario` entero. Con columnas explícitas es
 * imposible que se filtre.
 */
export async function GET() {
  try {
    await requireUser();

    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true,
        email: true,
        nombre: true,
        rol: true,
        activo: true,
        creadoEn: true,
        _count: { select: { licitacionesCreadas: true, pagosRegistrados: true } },
      },
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ data: usuarios });
  } catch (e) {
    return responderError(e);
  }
}

/**
 * POST /api/usuarios — SOLO ADMIN.
 *
 * Este es el requisito de roles del enunciado. La guarda va DENTRO del handler, no solo
 * en el proxy: el proxy protege páginas, y un endpoint se puede llamar directamente con
 * fetch. Es defensa en profundidad.
 */
export async function POST(req: Request) {
  try {
    const admin = await requireUser();
    if (admin.rol !== "ADMIN") throw errores.soloAdmin();

    const datos = CrearUsuarioSchema.parse(await req.json());

    const existente = await prisma.usuario.findUnique({
      where: { email: datos.email },
      select: { id: true },
    });
    if (existente) {
      throw errores.conflicto("EMAIL_EN_USO", "Ya existe un usuario con ese email");
    }

    const usuario = await prisma.usuario.create({
      data: {
        email: datos.email,
        nombre: datos.nombre,
        rol: datos.rol,
        passwordHash: await hashPassword(datos.password),
        creadoPorId: admin.id,
      },
      select: { id: true, email: true, nombre: true, rol: true, creadoEn: true },
    });

    return NextResponse.json({ data: usuario }, { status: 201 });
  } catch (e) {
    return responderError(e);
  }
}
