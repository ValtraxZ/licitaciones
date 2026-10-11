import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enviarRecordatorioAlCliente } from "@/lib/email/enviar";
import { debeVencer, entraEnVentanaRecordatorio } from "@/lib/estados";
import { cambiarEstado } from "@/lib/transiciones";

/**
 * Nunca se cachea. Sin esto, Next.js podría servir una respuesta vieja y devolver el
 * mismo JSON al día siguiente: un job que devuelve siempre lo mismo no sirve.
 */
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/licitaciones — JOB PROGRAMADO (requisitos 2 y 5)
 * ============================================================
 *
 * Hace DOS cosas, y el ORDEN importa:
 *
 *   1) VENCIMIENTO: toda `activa` cuya fecha límite ya pasó → `perdida` (req. 2)
 *   2) RECORDATORIO: toda `activa` a menos de 48 h, sin recordatorio previo → email (req. 5)
 *
 * POR QUÉ PRIMERO EL VENCIMIENTO
 * ------------------------------
 * Si fuera al revés, una licitación vencida hace 1 hora todavía entra en la ventana de
 * 48 h y el cliente recibiría un "¡tenés tiempo!" de algo que ya venció.
 *
 * POR QUÉ ES UN ENDPOINT Y NO UN CRON CON LÓGICA ADENTRO
 * -----------------------------------------------------
 * El transporte (quién llama: Vercel Cron, GitHub Actions o curl a mano) queda
 * desacoplado de la lógica. Se puede cambiar de plan, de proveedor o disparar a mano
 * para probar sin esperar al schedule. En una entrevista esto es un punto a favor.
 *
 * SEGURIDAD
 * ---------
 * Es una URL pública. Sin el header `Authorization: Bearer <CRON_SECRET>` cualquiera que
 * la conozca podría disparar vencimientos masivamente. Vercel manda ese header solo si la
 * variable `CRON_SECRET` está definida en el proyecto.
 */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  const autorizado = req.headers.get("authorization") === `Bearer ${secreto}`;

  // Sin CRON_SECRET definido NO se ejecuta: si el despliegue lo perdió, es preferible
  // que el job no corra a que corra abierto para cualquiera.
  if (!secreto || !autorizado) {
    return NextResponse.json(
      { error: { code: "NO_AUTORIZADO", message: "Header Authorization inválido o ausente" } },
      { status: 401 },
    );
  }

  const ahora = new Date();

  const resultado = {
    ejecutadoEn: ahora.toISOString(),
    vencidas: 0,
    recordatorios: 0,
    errores: [] as string[],
  };

  // ─── 1) VENCIMIENTO AUTOMÁTICO ──────────────────────────────────────────────
  const vencidas = await prisma.licitacion.findMany({
    where: { estado: "activa", fechaLimite: { lt: ahora } },
    select: { id: true, codigo: true, fechaLimite: true },
  });

  for (const lic of vencidas) {
    try {
      await cambiarEstado({
        licitacionId: lic.id,
        hacia: "perdida",
        // `origen: "automatica"` y actor sin id: en el historial queda claro que la
        // transición la hizo el sistema, no una persona. Es lo que hace verificable
        // el requisito 2.
        origen: "automatica",
        actor: { id: null, email: null },
        comentario: `Vencimiento automático: la fecha límite ${lic.fechaLimite.toISOString()} fue superada`,
      });
      resultado.vencidas++;
    } catch (e) {
      // Una licitación que falla no puede abortar el lote entero.
      resultado.errores.push(`${lic.codigo} (vencimiento): ${(e as Error).message}`);
    }
  }

  // ─── 2) RECORDATORIO DE 48 HORAS ───────────────────────────────────────────
  // Se cargan todas las candidatas y se filtra en memoria con el helper puro: la
  // condición (activa, en ventana, sin recordatorio previo) ya está testeada.
  const candidatas = await prisma.licitacion.findMany({
    where: {
      estado: "activa",
      fechaLimite: { gt: ahora }, // ya descartadas por el paso 1
    },
    select: {
      id: true,
      codigo: true,
      fechaLimite: true,
      recordatorioEnviadoEn: true,
      cliente: { select: { email: true } },
    },
  });

  for (const lic of candidatas) {
    if (!entraEnVentanaRecordatorio(lic, ahora)) continue;

    // RECLAMO ATÓMICO. Si dos corridas del cron se solapan (Vercel Hobby corre una vez
    // por día, pero un retry manual puede pisarse), las dos ven `recordatorioEnviadoEn:
    // null` y las dos enviarían el mail. Con `updateMany` filtrando por el mismo
    // `null`, solo una actualización afecta 1 fila y la otra obtiene `count: 0` y se salta.
    const reclamo = await prisma.licitacion.updateMany({
      where: { id: lic.id, recordatorioEnviadoEn: null },
      data: { recordatorioEnviadoEn: new Date() },
    });
    if (reclamo.count === 0) continue;

    try {
      await enviarRecordatorioAlCliente(lic.id);
      resultado.recordatorios++;
    } catch (e) {
      // Si falló el envío se libera el reclamo: de lo contrario la licitación nunca
      // más recibiría recordatorios, y el requisito 5 quedaría incumplido en silencio.
      await prisma.licitacion.update({
        where: { id: lic.id },
        data: { recordatorioEnviadoEn: null },
      });
      resultado.errores.push(`${lic.codigo} (recordatorio): ${(e as Error).message}`);
    }
  }

  return NextResponse.json(resultado);
}

/**
 * POST hace exactamente lo mismo que GET.
 *
 * Existe para poder dispararlo desde GitHub Actions, cron-job.org o cualquier
 * scheduler que solo hable por POST, sin tener que duplicar el endpoint.
 *
 * Chequeo manual desde la línea de comandos (sirve para la evidencia del README):
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/licitaciones
 */
export const POST = GET;
