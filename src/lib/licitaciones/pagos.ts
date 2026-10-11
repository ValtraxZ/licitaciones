/**
 * PAGOS Y COBRANZA (requisito 6)
 * ==============================
 * Reglas:
 *   - Solo se registran pagos en estado `por_cobrar`.
 *   - Saldo pendiente = `montoFacturado` − suma de pagos.
 *   - El pago nunca puede superar el saldo pendiente.
 *   - Cuando el saldo llega a cero, la licitación pasa a `cobrada` AUTOMÁTICAMENTE.
 *
 * El detalle técnico que hace que esto sea correcto bajo concurrencia está en el
 * `SELECT ... FOR UPDATE` de más abajo; leelo, es lo más importante del archivo.
 */

import { prisma } from "../db";
import { errores } from "../errores";
import { assertPagoValido, assertPuedePagar, calcularSaldo } from "../reglas";
import { cambiarEstado, type Actor } from "../transiciones";

export type DatosPago = {
  /** Centavos enteros. Un float acá rompe la aritmética de saldo. */
  monto: number;
  metodo: string;
  referencia?: string;
  notas?: string;
  fechaPago?: Date;
};

export async function registrarPago(licitacionId: string, datos: DatosPago, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    // ─── LOCK PESIMISTA ────────────────────────────────────────────────────────
    // Sin este SELECT, dos requests de pago simultáneos leen el MISMO saldo:
    //   saldo = 100.000, llegan dos pagos de 100.000 → los dos validan (100.000 <=
    //   100.000), los dos insertan, y terminas con 200.000 cobrados sobre 100.000
    //   facturados.
    //
    // `FOR UPDATE` bloquea la fila de la licitación hasta que esta transacción termine.
    // El segundo pago espera, y cuando lee ya ve el saldo descontado del primero.
    // Es la solución estándar para "leer, validar y escribir" sobre el mismo saldo.
    //
    // Prisma no expone el lock de fila en su API de alto nivel (`findUnique` no bloquea),
    // así que se usa `$queryRaw`. El SQL va PARAMETRIZADO: Prisma escapa el valor del id,
    // no hay riesgo de inyección. El nombre de la tabla es el mapeado en el schema
    // (`@@map("licitaciones")`), no el nombre del modelo.
    await tx.$queryRaw`SELECT id FROM licitaciones WHERE id = ${licitacionId} FOR UPDATE`;

    const licitacion = await tx.licitacion.findUnique({
      where: { id: licitacionId },
      include: { pagos: true },
    });
    if (!licitacion) throw errores.noEncontrado("Licitación");

    assertPuedePagar(licitacion.estado);

    const { saldo, pagado } = calcularSaldo(
      licitacion.montoFacturado,
      licitacion.pagos.map((p) => p.monto),
    );

    assertPagoValido(datos.monto, saldo);

    const pago = await tx.pago.create({
      data: {
        licitacionId,
        monto: datos.monto,
        metodo: datos.metodo,
        referencia: datos.referencia,
        notas: datos.notas,
        fechaPago: datos.fechaPago ?? new Date(),
        registradoPorId: actor.id,
      },
    });

    const saldoRestante = saldo - datos.monto;

    // ─── TRANSICIÓN AUTOMÁTICA A COBRADA ───────────────────────────────────────
    // Se dispara sola, sin endpoint. Si el usuario la pudiera forzar, alguien
    // "cobraría" una licitación que todavía debe plata.
    //
    // Pasa `tx` para que el cambio de estado quede en la MISMA transacción que el pago:
    // o se registran ambos, o ninguno. Sin esto, un corte de luz entre el insert del
    // pago y el update del estado deja una licitación por_cobrar con saldo cero,
    // que es un estado imposible que nadie puede recuperar a mano.
    if (saldoRestante === 0) {
      await cambiarEstado({
        licitacionId,
        hacia: "cobrada",
        origen: "sistema",
        actor,
        comentario: `Saldo pendiente alcanzado a cero. Total facturado ${pagado + datos.monto} centavos, cubierto en su totalidad.`,
        tx,
      });
    }

    return {
      pago,
      saldo: {
        facturado: licitacion.montoFacturado,
        pagadoAntes: pagado,
        pagado: pagado + datos.monto,
        saldoRestante,
      },
      cobradaAutomaticamente: saldoRestante === 0,
    };
  });
}

/**
 * Factura la licitación: `finalizada` → `por_cobrar` (requisito: "se facturó, queda
 * pendiente el cobro").
 *
 * `montoFacturado` es un campo APARTE de `totalProductos` a propósito: se puede
 * presupuestar $1.000.000 y facturar $950.000 con un descuento negociado. Si el
 * monto facturado fuera siempre igual al total, no se podría modelar una negociación.
 */
export async function facturar(licitacionId: string, montoFacturado: number, actor: Actor) {
  if (!Number.isInteger(montoFacturado)) {
    throw errores.regla("MONTO_NO_ENTERO", "El monto facturado debe ser un entero en centavos", {
      montoFacturado,
    });
  }
  if (montoFacturado <= 0) {
    throw errores.regla("MONTO_FACTURADO_INVALIDO", "El monto facturado debe ser mayor a cero", {
      montoFacturado,
    });
  }

  return prisma.$transaction(async (tx) => {
    const licitacion = await tx.licitacion.findUnique({ where: { id: licitacionId } });
    if (!licitacion) throw errores.noEncontrado("Licitación");

    // `cambiarEstado` valida sola que finalizada → por_cobrar esté permitida,
    // y escribe el historial en esta misma transacción.
    return cambiarEstado({
      licitacionId,
      hacia: "por_cobrar",
      actor,
      comentario: `Facturado por ${montoFacturado} centavos`,
      datosExtra: { montoFacturado },
      tx,
    });
  });
}
