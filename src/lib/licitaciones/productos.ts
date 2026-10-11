/**
 * PRODUCTOS DE UNA LICITACIÓN
 * ==========================
 * Agregar y quitar productos aplica dos reglas del enunciado:
 *   - Solo se puede en `borrador` y `activa` (los otros 4 estados son inmutables).
 *   - El total nunca puede superar el presupuesto máximo (requisito 1).
 *
 * Las dos cosas van dentro de UNA transacción junto con la actualización de
 * `licitacion.totalProductos`. Ese campo es un caché desnormalizado del total de los
 * ítems: si el insert del ítem tiene éxito y el update del total falla, la base queda
 * con un total que miente y la Regla 1 deja de proteger de verdad.
 */

import { prisma } from "../db";
import { errores } from "../errores";
import {
  assertDentroDePresupuesto,
  assertEditable,
  presupuestoDisponible,
  totalConItem,
} from "../reglas";

export type ItemProducto = {
  productoId: string;
  cantidad: number;
  precioUnitario: number;
};

/**
 * Agrega un producto a la licitación. Si el producto ya estaba, actualiza el ítem
 * (no duplica): la tabla puente tiene `@@unique([licitacionId, productoId])`.
 */
export async function agregarProducto(licitacionId: string, item: ItemProducto) {
  if (!Number.isInteger(item.cantidad) || !Number.isInteger(item.precioUnitario)) {
    throw errores.regla(
      "MONTOS_NO_ENTEROS",
      "La cantidad y el precio deben ser enteros en centavos",
      { ...item },
    );
  }
  if (item.cantidad <= 0) {
    throw errores.regla("CANTIDAD_INVALIDA", "La cantidad debe ser mayor a cero", { cantidad: item.cantidad });
  }
  if (item.precioUnitario < 0) {
    throw errores.regla("PRECIO_INVALIDO", "El precio no puede ser negativo", { precioUnitario: item.precioUnitario });
  }

  return prisma.$transaction(async (tx) => {
    const licitacion = await tx.licitacion.findUnique({
      where: { id: licitacionId },
      include: { productos: true },
    });
    if (!licitacion) throw errores.noEncontrado("Licitación");

    assertEditable(licitacion.estado);

    const previo = licitacion.productos.find((p) => p.productoId === item.productoId);

    // `totalConItem` resta el subtotal anterior si el producto ya estaba: sin eso el
    // mismo producto se contaría dos veces y el presupuesto quedaría falseado.
    const totalNuevo = totalConItem(
      licitacion.totalProductos,
      item.cantidad,
      item.precioUnitario,
      previo?.subtotal ?? 0,
    );

    assertDentroDePresupuesto(licitacion.totalProductos, totalNuevo, licitacion.presupuestoMaximo);

    const subtotal = item.cantidad * item.precioUnitario;

    if (previo) {
      await tx.licitacionProducto.update({
        where: { id: previo.id },
        data: { cantidad: item.cantidad, precioUnitario: item.precioUnitario, subtotal },
      });
    } else {
      await tx.licitacionProducto.create({
        data: {
          licitacionId,
          productoId: item.productoId,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          subtotal,
        },
      });
    }

    return tx.licitacion.update({
      where: { id: licitacionId },
      data: { totalProductos: totalNuevo },
    });
  });
}

/** Quita un producto y descuenta su subtotal del total. */
export async function quitarProducto(licitacionId: string, itemId: string) {
  return prisma.$transaction(async (tx) => {
    const licitacion = await tx.licitacion.findUnique({
      where: { id: licitacionId },
      include: { productos: true },
    });
    if (!licitacion) throw errores.noEncontrado("Licitación");

    assertEditable(licitacion.estado);

    const item = licitacion.productos.find((p) => p.id === itemId);
    if (!item) {
      throw errores.noEncontrado("Producto en la licitación");
    }

    await tx.licitacionProducto.delete({ where: { id: itemId } });

    return tx.licitacion.update({
      where: { id: licitacionId },
      // Bajar el total nunca puede violar el presupuesto, así que no hace falta revalidar.
      data: { totalProductos: licitacion.totalProductos - item.subtotal },
    });
  });
}

/** Datos para pintar la UI: ítems, totales y si se pueden seguir agregando cosas. */
export async function detalleProductos(licitacionId: string) {
  const licitacion = await prisma.licitacion.findUnique({
    where: { id: licitacionId },
    include: {
      productos: { include: { producto: true }, orderBy: { producto: { nombre: "asc" } } },
    },
  });
  if (!licitacion) throw errores.noEncontrado("Licitación");

  return {
    items: licitacion.productos,
    totales: {
      cantidadItems: licitacion.productos.length,
      unidades: licitacion.productos.reduce((a, p) => a + p.cantidad, 0),
      totalProductos: licitacion.totalProductos,
      presupuestoMaximo: licitacion.presupuestoMaximo,
      disponible: presupuestoDisponible(licitacion),
      usaPresupuesto:
        licitacion.presupuestoMaximo > 0
          ? Math.round((licitacion.totalProductos / licitacion.presupuestoMaximo) * 100)
          : 0,
    },
  };
}
