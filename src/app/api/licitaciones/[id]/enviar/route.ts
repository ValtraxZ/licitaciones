import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enviarPropuestaAlCliente } from "@/lib/email/enviar";
import { errores } from "@/lib/errores";
import { responderError } from "@/lib/http";
import { assertPuedeEnviar } from "@/lib/reglas";
import { requireUser } from "@/lib/session";
import { cambiarEstado } from "@/lib/transiciones";

export const dynamic = "force-dynamic";

/**
 * POST /api/licitaciones/[id]/enviar — borrador → activa.
 *
 * Cubre los requisitos 3 y 4:
 *   - Valida que exista documento de propuesta (422 si no).
 *   - Valida que la fecha límite no haya vencido.
 *   - Transiciona a `activa` escribiendo el historial.
 *   - Envía el correo real al cliente con el resumen y el adjunto.
 *
 * POR QUÉ EL CORREO VA DESPUÉS DE LA TRANSICIÓN Y NO DENTRO DE UNA TRANSACCIÓN
 * ---------------------------------------------------------------------------
 * 1. Consistencia: si transiciono primero y el email falla, la licitación queda `activa`
 *    con su historial correcto y el correo se puede reenviar. Si mando el email primero
 *    y la transición falla, mandé una propuesta "oficial" de algo que internamente sigue
 *    en borrador: el cliente tiene un documento que nunca fue registrado. Peor.
 *
 * 2. Latencia: una llamada de red a Resend tarda entre 300 ms y 2 s. Dentro de una
 *    transacción mantiene el lock de la fila ese tiempo, y en la demo se nota.
 *
 * Si el envío falla NO se revierte la transición: el envío formal ocurrió igual y el
 * problema es de notificación, no de estado. Se loguea para poder reintentar.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await requireUser();
    const { id } = await params;

    const licitacion = await prisma.licitacion.findUnique({
      where: { id },
      include: { cliente: { select: { nombre: true, email: true } } },
    });
    if (!licitacion) throw errores.noEncontrado("Licitación");

    // Todas las validaciones de salida: transición válida, documento presente y plazo vigente.
    assertPuedeEnviar(licitacion);

    const actualizada = await cambiarEstado({
      licitacionId: id,
      hacia: "activa",
      actor: { id: usuario.id, email: usuario.email },
      comentario: `Enviada formalmente a ${licitacion.cliente.email}`,
    });

    let correo: { enviado: boolean; id?: string; error?: string } = { enviado: false };

    try {
      const resultado = await enviarPropuestaAlCliente(id);
      correo = { enviado: true, id: resultado.id };
    } catch (e) {
      correo = { enviado: false, error: (e as Error).message };
      console.error("[email] fallo al enviar la propuesta", { licitacionId: id, error: correo.error });
    }

    return NextResponse.json({
      data: actualizada,
      correo,
      // Se distingue "se envió mal" de "no se envió" para que la UI pueda avisar sin
      // que el usuario crea que la licitación no se activó.
      aviso: correo.enviado
        ? null
        : "La licitación se activó, pero el correo no pudo enviarse. Revisá los logs.",    });
  } catch (e) {
    return responderError(e);
  }
}
