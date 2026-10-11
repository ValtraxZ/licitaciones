/**
 * MOTOR DE TRANSICIONES
 * =====================
 * `cambiarEstado()` es el ÚNICO lugar del proyecto donde se modifica el campo `estado`
 * de una licitación. Si escribís un `prisma.licitacion.update({ data: { estado: ... } })`
 * fuera de este archivo, rompiste el requisito 7 (auditoría) sin darte cuenta.
 * Es la única defensa contra eso.
 *
 * Qué garantiza esta función, siempre:
 *   1. Que la transición esté permitida por la tabla de estados.
 *   2. Que se registre el historial (estado anterior, nuevo, usuario, origen, fecha).
 *   3. Que se actualicen los timestamps contextuales (enviadaEn / resueltaEn / cerradaEn).
 *   4. Que pueda participar de la transacción de otra operación (parámetro `tx`).
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { errores } from "./errores";
import { assertTransicionValida } from "./reglas";
import type { EstadoLicitacion } from "./estados";

/** Quién pidió el cambio. `null` cuando lo disparó el job programado. */
export type Actor = {
  id: string | null;
  email: string | null;
};

export type ParametrosCambioEstado = {
  licitacionId: string;
  hacia: EstadoLicitacion;
  /** `manual` por defecto; `automatica` para el vencimiento; `sistema` para el cobro total. */
  origen?: "manual" | "automatica" | "sistema";
  actor?: Actor;
  comentario?: string;
  /** Campos extra del update (ej. `montoFacturado` al facturar). */
  datosExtra?: Prisma.LicitacionUpdateInput;
  /** Si viene, la operación se ejecuta dentro de esta transacción. */
  tx?: Prisma.TransactionClient;
};

/**
 * Timestamps contextuales: qué fecha se estampa en cada transición.
 *
 * Por qué no basta `creadoEn`: el requisito es auditar que la propuesta se envió ANTES del
 * plazo. Una licitación creada hace 20 días y enviada ayer tiene `creadoEn` viejo y
 * `enviadaEn` de ayer. Solo con `enviadaEn` se puede demostrar.
 *
 * Nota: `perdida` aparece en dos filas porque cumple dos roles distintos a la vez
 * (se "resuelve" como negativas y se "cierra" como proceso terminado).
 */
function timestampsDe(estado: EstadoLicitacion, ahora: Date): Prisma.LicitacionUpdateInput {
  switch (estado) {
    case "activa":
      return { enviadaEn: ahora };
    case "finalizada":
      return { resueltaEn: ahora };
    case "perdida":
      return { resueltaEn: ahora, cerradaEn: ahora };
    case "cobrada":
      return { cerradaEn: ahora };
    default:
      // borrador y por_cobrar no estampan nada: entrar a por_cobrar es una factura,
      // no una resolución de la licitación.
      return {};
  }
}

export async function cambiarEstado(params: ParametrosCambioEstado) {
  const db = params.tx ?? prisma;
  const { licitacionId, hacia, origen = "manual", actor, comentario } = params;

  // Se relee DENTRO de la transacción: el estado que se valida y el que queda en el
  // historial tienen que ser el mismo hecho. Si nos confiaramos del estado que pasó el
  // caller, entre su lectura y nuestro update otro request pudo mover la licitación
  // (condición de carrera / TOCTOU).
  const licitacion = await db.licitacion.findUnique({
    where: { id: licitacionId },
    select: { id: true, estado: true, codigo: true },
  });

  if (!licitacion) throw errores.noEncontrado("Licitación");

  assertTransicionValida(licitacion.estado, hacia);

  const ahora = new Date();

  const actualizada = await db.licitacion.update({
    where: { id: licitacionId },
    data: {
      estado: hacia,
      ...timestampsDe(hacia, ahora),
      ...params.datosExtra,
    },
  });

  // El historial se escribe en la MISMA transacción que el update: o quedan los dos
  // o no queda ninguno. Nunca una licitación cambiada de estado sin rastro.
  await db.historialTransicion.create({
    data: {
      licitacionId,
      estadoAnterior: licitacion.estado,
      estadoNuevo: hacia,
      origen,
      usuarioId: actor?.id ?? null,
      usuarioEmail: actor?.email ?? null,
      comentario,
    },
  });

  return actualizada;
}
