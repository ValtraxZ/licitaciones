import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errores } from "@/lib/errores";
import { responderError } from "@/lib/http";
import { generarPDFPropuesta } from "@/lib/pdf/propuesta";
import { requireUser } from "@/lib/session";
import { subirPropuesta } from "@/lib/storage";
import { assertTieneDocumento } from "@/lib/reglas";
import { esEditable } from "@/lib/estados";

export const dynamic = "force-dynamic";

/**
 * POST /api/licitaciones/[id]/documento/generar
 *
 * Genera el PDF de la propuesta a partir de los datos de la licitación, lo sube a
 * Storage y lo deja como documento adjunto. Es lo que hace una persona en la vida real:
 * arma el documento con los productos cotizados y lo adjunta, en vez de subir un PDF
 * hecho a mano que puede no coincidir con lo que dice la base.
 *
 * Escribe el PDF desde los MISMOS datos que usa la API, así que el documento y el
 * detalle nunca pueden mostrar montos distintos.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await requireUser();
    const { id } = await params;

    const licitacion = await prisma.licitacion.findUnique({
      where: { id },
      include: {
        cliente: true,
        productos: { include: { producto: true }, orderBy: { id: "asc" } },
        creadoPor: { select: { nombre: true } },
      },
    });
    if (!licitacion) throw errores.noEncontrado("Licitación");

    if (!esEditable(licitacion.estado)) {
      throw errores.conflicto(
        "NO_EDITABLE",
        `No se puede generar la propuesta en estado "${licitacion.estado}"`,
        { estado: licitacion.estado },
      );
    }

    if (licitacion.productos.length === 0) {
      throw errores.regla(
        "SIN_PRODUCTOS",
        "Agregá al menos un producto antes de generar la propuesta",
        { productos: 0 },
      );
    }

    const pdf = await generarPDFPropuesta({
      codigo: licitacion.codigo,
      titulo: licitacion.titulo,
      descripcion: licitacion.descripcion,
      cliente: {
        nombre: licitacion.cliente.nombre,
        razonSocial: licitacion.cliente.razonSocial,
        email: licitacion.cliente.email,
        telefono: licitacion.cliente.telefono,
      },
      emisor: "Estudio Comercial — Sistema de Licitaciones",
      presupuestoMaximo: licitacion.presupuestoMaximo,
      totalProductos: licitacion.totalProductos,
      fechaLimite: licitacion.fechaLimite,
      emitidoEn: new Date(),
      items: licitacion.productos.map((p) => ({
        nombre: p.producto.nombre,
        sku: p.producto.sku,
        cantidad: p.cantidad,
        precioUnitario: p.precioUnitario,
        subtotal: p.subtotal,
      })),
      condiciones: [
        "Los precios incluyen la provisión de los bienes y servicios descritos en el detalle.",
        "El plazo de entrega se acuerda en la orden de compra, una vez adjudicada la licitación.",
        "La propuesta se paga en dos cuotas: 50 % al adjudicar y 50 % contra entrega.",
        `La presente propuesta tiene vigencia hasta el ${licitacion.fechaLimite.toLocaleDateString("es-AR")}.`,
      ],
    });

    // Se sube con el mismo `subirPropuesta` que valida extensión, tamaño y sanea el nombre.
    const nombreArchivo = `propuesta-${licitacion.codigo}.pdf`;
    const subido = await subirPropuesta(
      id,
      new File([new Uint8Array(pdf)], nombreArchivo, { type: "application/pdf" }),
    );

    const actualizada = await prisma.licitacion.update({
      where: { id },
      data: {
        documentoPath: subido.path,
        documentoNombre: subido.nombre,
        documentoMime: subido.mime,
        documentoTamano: subido.tamano,
        actualizadoPorId: usuario.id,
      },
      select: { id: true, documentoNombre: true, documentoTamano: true, actualizadoEn: true },
    });

    return NextResponse.json({ data: actualizada }, { status: 201 });
  } catch (e) {
    return responderError(e);
  }
}
