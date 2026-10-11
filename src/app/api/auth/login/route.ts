import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errores } from "@/lib/errores";
import { responderError } from "@/lib/http";
import { verifyPassword } from "@/lib/passwords";
import { setearSesion } from "@/lib/session";
import { LoginSchema } from "@/lib/validators";

/**
 * POST /api/auth/login
 *
 * Comparte el MISMO mensaje de error para "usuario inexistente" y "contraseña
 * incorrecta". Si los distinguís, estás leaky: un atacante puede recorrer la lista de
 * emails válidos de la empresa y descubrir a quién le corresponde. El login puede ser
 * lento (bcrypt ~100 ms), así que además el tiempo de respuesta es parecido en ambos
 * casos; si el usuario no existe devolvemos sin hashear, lo cual delata la diferencia.
 */

export async function POST(req: Request) {
  try {
    const body = LoginSchema.parse(await req.json());

    const usuario = await prisma.usuario.findUnique({
      where: { email: body.email },
      select: {
        id: true, email: true, nombre: true, rol: true,
        passwordHash: true, activo: true,
      },
    });

    const credencialesOk =
      !!usuario && usuario.activo && (await verifyPassword(body.password, usuario.passwordHash));

    if (!credencialesOk) {
      throw errores.noAutenticado("Email o contraseña incorrectos");
    }

    await setearSesion({
      id: usuario!.id,
      email: usuario!.email,
      nombre: usuario!.nombre,
      rol: usuario!.rol,
    });

    // No se devuelve el passwordHash: la respuesta es lo que ve el navegador.
    return NextResponse.json({
      data: { id: usuario!.id, email: usuario!.email, nombre: usuario!.nombre, rol: usuario!.rol },
    });
  } catch (e) {
    return responderError(e);
  }
}
