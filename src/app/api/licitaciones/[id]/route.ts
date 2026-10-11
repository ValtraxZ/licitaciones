import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errores } from "@/lib/errores";
import { ETIQUETA_ESTADO, esEditable, transicionesDisponibles } from "@/lib/estados";
import { responderError } from "@/lib/http";
import { calcularSaldo, presupuestoDisponible } from "@/lib/reglas";
import { urlFirmada } from "@/lib/storage";
import { requireUser } from "@/lib/session";
import { tiempoRestante } from "@/lib/dinero";

export const dynamic = "force-dynamic";

/**
 * GET /api/licitaciones/[id] — detalle completo.
 *
 * Devuelve en UNA sola respuesta todo lo que la pantalla necesita: datos generales,
 * productos, pagos, saldo, historial y las acciones disponibles.
 *
 * Dos decisiones importantes:
 *
 * 1. `transicionesDisponibles` y `editable` los calcula el SERVIDOR. El frontend NO
 *    reimplementa la tabla de estados: si la duplicara, el día que se agregue un estado
 *    mostraría un botón que el backend rechaza con 422.
 *
 * 2. El saldo se calcula en el servidor, que es el único lugar confiable. Si lo calculara
 *    el cliente, dos pestañas abiertas mostrarían números distintos y el frontend pasaría
 *    a ser la fuente de verdad del dinero.
 *
 * En Next 16, `params` es una Promise y hay que awaitearla: el acceso síncrono se eliminó.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;

    const licitacion = await prisma.licitacion.findUnique({
      where: { id },
      include: {
        cliente: true,
        productos: {
          include: { producto: { select: { id: true, sku: true, nombre: true } } },
          orderBy: { id: "asc" },
        },
        pagos: {
          orderBy: { fechaPago: "desc" },
          include: { registradoPor: { select: { nombre: true } } },
        },
        historial: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true, estadoAnterior: true, estadoNuevo: true,
            origen: true, usuarioEmail: true, comentario: true, createdAt: true,
          },
        },
      },
    });

    if (!licitacion) throw errores.noEncontrado("Licitación");

    const saldo = calcularSaldo(
      licitacion.montoFacturado,
      licitacion.pagos.map((p) => p.monto),
    );

    // Link temporal al documento. El bucket es privado, así que no hay una URL
    // permanente guardada: se genera acá, en el momento en que alguien la pide.
    let documentoUrl: string | null = null;
    if (licitacion.documentoPath) {
      try {
        documentoUrl = await urlFirmada(licitacion.documentoPath, 3600);
      } catch {
        // Si el archivo se borró de Storage, la licitación sigue siendo válida: se
        // devuelve `null` y la UI muestra "documento no disponible" en vez de 500.
        documentoUrl = null;
      }
    }

    return NextResponse.json({
      data: {
        ...licitacion,
        documentoUrl,
        etiquetaEstado: ETIQUETA_ESTADO[licitacion.estado],
        transicionesDisponibles: transicionesDisponibles(licitacion.estado),
        editable: esEditable(licitacion.estado),
        totales: {
          ...saldo,
          items: licitacion.productos.length,
          unidades: licitacion.productos.reduce((a, p) => a + p.cantidad, 0),
          presupuestoDisponible: presupuestoDisponible(licitacion),
        },
        tiempoRestante: tiempoRestante(licitacion.fechaLimite),
      },
    });
  } catch (e) {
    return responderError(e);
  }
}
