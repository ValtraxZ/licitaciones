/**
 * ALTA DE LICITACIONES
 * ====================
 * Toda licitación nace en estado `borrador`, implícitamente: el `default` del enum en
 * Prisma ya es `borrador`, y el cliente no puede mandar otro estado. Eso implementa el
 * "borrador (implícito, antes de enviar)" del enunciado sin necesidad de una columna
 * extra ni de un chequeo: no existe forma de crear una licitación ya activa.
 */

import { prisma } from "../db";
import { errores } from "../errores";
import type { Actor } from "../transiciones";
import type { LicitacionInput } from "../validators";

/**
 * Genera un código legible: "LIC-2026-0007".
 *
 * Se usa como clave de negocio para que aparezca en el correo al cliente, en la UI y en
 * la auditoría, en vez de un UUID.
 *
 * Trade-off conocido: se calcula con un `count` + 1, que no es atómico. Si dos requests
 * de alta simultáneos cuentan 6, los dos intentan LIC-2026-0007 y el segundo choca con el
 * `@unique` (409). Es aceptable para este volumen y es una restricción de la base la que
 * resuelve el conflicto, no un dato corrupto. Con más concurrencia la alternativa es una
 * secuencia de Postgres o un contador en una tabla con `SELECT ... FOR UPDATE`.
 */
async function generarCodigo(): Promise<string> {
  const anio = new Date().getFullYear();
  const desde = new Date(`${anio}-01-01T00:00:00.000Z`);

  const cantidad = await prisma.licitacion.count({
    where: { creadoEn: { gte: desde } },
  });

  return `LIC-${anio}-${String(cantidad + 1).padStart(4, "0")}`;
}

export async function crearLicitacion(datos: LicitacionInput, actor: Actor) {
  // El cliente tiene que existir: sin él la licitación no tiene a quién mandarle la
  // propuesta. Se valida acá para devolver un mensaje claro en vez de un FK violation.
  const cliente = await prisma.cliente.findUnique({
    where: { id: datos.clienteId },
    select: { id: true, nombre: true },
  });
  if (!cliente) {
    throw errores.regla("CLIENTE_INEXISTENTE", "El cliente indicado no existe", {
      clienteId: datos.clienteId,
    });
  }

  if (datos.fechaLimite <= new Date()) {
    throw errores.regla(
      "FECHA_LIMITE_INVALIDA",
      "La fecha límite debe ser futura: es la fecha en la que vence la presentación",
      { fechaLimite: datos.fechaLimite },
    );
  }

  const codigo = await generarCodigo();

  return prisma.licitacion.create({
    data: {
      codigo,
      titulo: datos.titulo,
      descripcion: datos.descripcion,
      clienteId: datos.clienteId,
      presupuestoMaximo: datos.presupuestoMaximo,
      fechaLimite: datos.fechaLimite,
      estado: "borrador",
      creadoPorId: actor.id,
      // Sin productos ni documento, totalProductos = 0. Se inicializa explícito para
      // que el campo nunca sea null en la base.
      totalProductos: 0,
    },
    include: { cliente: { select: { id: true, nombre: true, email: true } } },
  });
}
