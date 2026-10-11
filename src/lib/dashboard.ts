import { prisma } from "./db";
import { calcularSaldo } from "./reglas";

/**
 * Consultas del panel.
 *
 * Toda la agregación vive en la base (COUNT, SUM) y no en JavaScript: traer 500
 * licitaciones para contarlas en el server es lo que hace lento un panel.
 */

const DIAS_VENTANA = 7;

export async function obtenerResumen() {
  const ahora = new Date();
  const en7dias = new Date(ahora.getTime() + DIAS_VENTANA * 86_400_000);

  // Son 4 consultas INDEPENDIENTES entre sí: con Promise.all van en paralelo en vez de
  // esperarse. En serverless cada query va por el pooler a otra región, así que
  // secuenciales tardan 4x más. Una sola línea de mejora real.
  const [activas, porCobrar, proximas, totals] = await Promise.all([
    prisma.licitacion.count({ where: { estado: "activa" } }),
    prisma.licitacion.findMany({
      where: { estado: "por_cobrar" },
      select: { montoFacturado: true, pagos: { select: { monto: true } } },
    }),
    prisma.licitacion.findMany({
      where: {
        estado: "activa",
        fechaLimite: { lte: en7dias },
      },
      include: { cliente: { select: { nombre: true } } },
      orderBy: { fechaLimite: "asc" },
    }),
    prisma.licitacion.groupBy({
      by: ["estado"],
      _count: { _all: true },
    }),
  ]);

  // El saldo se calcula con la MISMA función pura que usa la API, no con un cálculo
  // paralelo: una sola definición de "saldo pendiente" en todo el proyecto.
  let saldoPorCobrar = 0;
  let facturadoTotal = 0;
  for (const l of porCobrar) {
    const { saldo, facturado } = calcularSaldo(
      l.montoFacturado,
      l.pagos.map((p) => p.monto),
    );
    saldoPorCobrar += saldo;
    facturadoTotal += facturado;
  }

  return {
    metricas: {
      activas,
      proximasAVencer: proximas.length,
      porCobrar: porCobrar.length,
      saldoPorCobrar,
      facturadoTotal,
      porEstado: Object.fromEntries(totals.map((t) => [t.estado, t._count._all])),
    },
    proximas,
    ventanaDias: DIAS_VENTANA,
  };
}

export async function obtenerCatalogo() {
  const [clientes, productos] = await Promise.all([
    prisma.cliente.findMany({
      select: { id: true, nombre: true, email: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.producto.findMany({
      where: { activo: true },
      select: { id: true, sku: true, nombre: true, precioUnitario: true },
      orderBy: { nombre: "asc" },
    }),
  ]);
  return { clientes, productos };
}
