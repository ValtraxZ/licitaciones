import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errores } from "@/lib/errores";
import { esEditable } from "@/lib/estados";
import { responderError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { subirPropuesta } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * POST /api/licitaciones/[id]/documento — sube la propuesta a Supabase Storage.
 *
 * Multipart form con el campo `archivo`.
 *
 * Se reutiliza `esEditable` (misma lista que el enunciado usa para los productos) para
 * el documento: una licitación en `finalizada`, `por_cobrar`, `cobrada` o `perdida` es
 * inmutable en todo sentido, no solo en sus productos.
 *
 * El `path` se guarda en la base y NO el link: el link se genera en el momento de
 * necesitarlo (bucket privado, URL firmada temporal).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await requireUser();
    const { id } = await params;

    const licitacion = await prisma.licitacion.findUnique({
      where: { id },
      select: { id: true, estado: true },
    });
    if (!licitacion) throw errores.noEncontrado("Licitación");

    if (!esEditable(licitacion.estado)) {
      throw errores.conflicto(
        "NO_EDITABLE",
        `No se puede cambiar el documento de una licitación en estado "${licitacion.estado}"`,
        { estado: licitacion.estado },
      );
    }

    const form = await req.formData();
    const archivo = form.get("archivo");

    if (!(archivo instanceof File)) {
      throw errores.regla("ARCHIVO_FALTANTE", 'Falta el archivo en el campo "archivo"');
    }

    const subido = await subirPropuesta(id, archivo);

    const actualizada = await prisma.licitacion.update({
      where: { id },
      data: {
        documentoPath: subido.path,
        documentoNombre: subido.nombre,
        documentoMime: subido.mime,
        documentoTamano: subido.tamano,
        actualizadoPorId: usuario.id,
      },
      select: { id: true, documentoNombre: true, documentoMime: true, documentoTamano: true, actualizadoEn: true },
    });

    return NextResponse.json({ data: actualizada }, { status: 201 });
  } catch (e) {
    return responderError(e);
  }
}
