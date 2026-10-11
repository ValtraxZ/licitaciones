/**
 * Envío de los correos de una licitación.
 *
 * Estas funciones arman los datos y llaman a Resend. No deciden NADA de negocio: la
 * transición de estado y sus validaciones ocurren antes, en `cambiarEstado()`.
 */

import { prisma } from "../db";
import { descargarArchivo, urlFirmada } from "../storage";
import { plantillaPropuesta, plantillaRecordatorio } from "./plantillas";
import { enviarCorreo, type ResultadoEnvio } from "./resend";

type Include = {
  cliente: { nombre: string; email: string };
  productos: Array<{
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
    producto: { nombre: string; sku: string };
  }>;
};

/** Carga la licitación con lo necesario para armar el correo. */
async function cargarParaCorreo(licitacionId: string) {
  const lic = await prisma.licitacion.findUniqueOrThrow({
    where: { id: licitacionId },
    include: {
      cliente: { select: { nombre: true, email: true } },
      productos: {
        include: { producto: { select: { nombre: true, sku: true } } },
      },
      creadoPor: { select: { nombre: true } },
    },
  });
  return lic;
}

/** Arma el link temporal al documento, si hay documento. */
async function linkDocumento(licitacionId: string, documentoPath: string | null) {
  if (!documentoPath) return null;
  try {
    return await urlFirmada(documentoPath, 7 * 24 * 3600); // 7 días
  } catch {
    return null;
  }
}

/**
 * Requisito 4: al activar una licitación se envía la propuesta al cliente con el resumen
 * (productos, presupuesto, fecha límite) Y el documento adjunto.
 *
 * El adjunto son los BYTES del PDF, no un link: el enunciado pide "el documento adjunto".
 * El link va además en el cuerpo del correo, que es lo que un cliente realmente quiere.
 */
export async function enviarPropuestaAlCliente(licitacionId: string): Promise<ResultadoEnvio> {
  const lic = await cargarParaCorreo(licitacionId);

  if (!lic.documentoPath) {
    throw new Error("No se puede enviar la propuesta: la licitación no tiene documento");
  }

  const contenido = await descargarArchivo(lic.documentoPath);
  const documentoUrl = await linkDocumento(licitacionId, lic.documentoPath);

  const { html, texto } = plantillaPropuesta({
    codigo: lic.codigo,
    titulo: lic.titulo,
    descripcion: lic.descripcion,
    presupuestoMaximo: lic.presupuestoMaximo,
    totalProductos: lic.totalProductos,
    fechaLimite: lic.fechaLimite,
    cliente: lic.cliente,
    productos: lic.productos,
    documentoNombre: lic.documentoNombre,
    documentoUrl,
    emitidoPor: lic.creadoPor?.nombre,
  });

  return enviarCorreo({
    destinatario: lic.cliente.email,
    asunto: `Propuesta comercial ${lic.codigo} — ${lic.titulo}`,
    html,
    texto,
    adjunto: {
      nombre: lic.documentoNombre ?? `propuesta-${lic.codigo}.pdf`,
      contenido,
    },
  });
}

/**
 * Requisito 5: recordatorio cuando faltan menos de 48 h.
 *
 * El recordatorio NO lleva adjunto (el cliente ya lo recibió): lleva el link al
 * documento. Igual se manda el texto plano siempre.
 */
export async function enviarRecordatorioAlCliente(licitacionId: string): Promise<ResultadoEnvio> {
  const lic = await cargarParaCorreo(licitacionId);

  const documentoUrl = await linkDocumento(licitacionId, lic.documentoPath);
  const horasRestantes = Math.max(
    1,
    Math.round((lic.fechaLimite.getTime() - Date.now()) / 3_600_000),
  );

  const { html, texto } = plantillaRecordatorio(
    {
      codigo: lic.codigo,
      titulo: lic.titulo,
      presupuestoMaximo: lic.presupuestoMaximo,
      totalProductos: lic.totalProductos,
      fechaLimite: lic.fechaLimite,
      cliente: lic.cliente,
      productos: lic.productos,
      documentoUrl,
    },
    horasRestantes,
  );

  return enviarCorreo({
    destinatario: lic.cliente.email,
    asunto: `Recordatorio: la propuesta ${lic.codigo} vence en ${horasRestantes} h`,
    html,
    texto,
  });
}

export type { Include };
