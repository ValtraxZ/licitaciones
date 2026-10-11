/**
 * REGLAS DE NEGOCIO
 * =================
 * Todas las funciones de este archivo son PURAS: reciben datos planos y lanzan o devuelven.
 * No tocan la base de datos ni conocen Prisma.
 *
 * POR QUÉ SEPARARLAS DE LA CAPA DE DATOS
 * ---------------------------------------
 * 1. Se testean sin levantar nada (`src/lib/__tests__/reglas.test.ts`). Los evaluadores
 *    valoran tests de la máquina de estados y del cálculo de saldo, y esto lo permite
 *    porque el 70% de la lógica crítica queda en funciones puras.
 * 2. Se pueden usar igual desde el cliente si alguna vez hace falta.
 * 3. La función que accede a la DB (agregar producto, registrar pago) queda cortita:
 *    lee datos, delega la decisión a estas funciones, escribe. Se lee de un vistazo.
 *
 * Cada función que valida algo LANZA `ErrorNegocio` con su status y `code` de negocio.
 * Validar no es devolver `false`: es decir QUÉ pasó y con qué código HTTP responde la API.
 */

import { errores } from "./errores";
import { formatear } from "./dinero";
import { esEditable, puedeTransicionar, transicionesDisponibles, type EstadoLicitacion } from "./estados";

/** Datos mínimos de una licitación para poder aplicar las reglas. */
export type LicitacionReglas = {
  estado: EstadoLicitacion;
  presupuestoMaximo: number;
  totalProductos: number;
  montoFacturado: number;
  documentoPath: string | null;
  fechaLimite: Date;
};

// ─────────────────────── REGLA 1: presupuesto máximo ───────────────────────

/**
 * El total de productos no puede superar el presupuesto máximo (requisito 1).
 *
 * Se pasa `totalActual` y `totalNuevo` en vez de solo el nuevo total para poder armar un
 * mensaje de error útil: cuánto se pidió, cuánto había y cuánto era el tope.
 */
export function assertDentroDePresupuesto(
  totalActual: number,
  totalNuevo: number,
  presupuestoMaximo: number,
): void {
  if (totalNuevo > presupuestoMaximo) {
    throw errores.regla(
      "PRESUPUESTO_EXCEDIDO",
      `El total de productos (${formatear(totalNuevo)}) supera el presupuesto máximo (${formatear(presupuestoMaximo)})`,
      {
        totalActual,
        totalNuevo,
        presupuestoMaximo,
        excedente: totalNuevo - presupuestoMaximo,
      },
    );
  }
}

/** Cuánto se puede seguir agregando. La UI lo muestra como "presupuesto disponible". */
export function presupuestoDisponible(lic: { totalProductos: number; presupuestoMaximo: number }): number {
  return Math.max(0, lic.presupuestoMaximo - lic.totalProductos);
}

/** ¿Este ítem nuevo haría exceder el presupuesto? (para mostrar el botón deshabilitado) */
export function excedePresupuesto(
  lic: { totalProductos: number; presupuestoMaximo: number },
  cantidad: number,
  precioUnitario: number,
): boolean {
  return lic.totalProductos + cantidad * precioUnitario > lic.presupuestoMaximo;
}

// ────────────────────── Cálculo del total al agregar ──────────────────────

/**
 * Calcula el delta que aporta un ítem al total de la licitación.
 *
 * El detalle importante: si el producto YA estaba en la licitación, hay que restar el
 * subtotal anterior. Si se sumara el ítem nuevo al total viejo sin restar, el mismo
 * producto se contaría DOS veces y el presupuesto quedaría falseado.
 *
 * `subtotalPrevio` es 0 si el producto es nuevo.
 */
export function deltaSubtotal(
  cantidad: number,
  precioUnitario: number,
  subtotalPrevio: number,
): number {
  return cantidad * precioUnitario - subtotalPrevio;
}

/** Total resultante de la licitación después de aplicar el ítem. */
export function totalConItem(
  totalActual: number,
  cantidad: number,
  precioUnitario: number,
  subtotalPrevio: number,
): number {
  return totalActual + deltaSubtotal(cantidad, precioUnitario, subtotalPrevio);
}

// ────────────────────── Editabilidad de la licitación ──────────────────────

/** Solo `borrador` y `activa` permiten agregar/quitar productos o cambiar el documento. */
export function assertEditable(estado: EstadoLicitacion): void {
  if (!esEditable(estado)) {
    throw errores.conflicto(
      "NO_EDITABLE",
      `No se pueden agregar ni quitar productos en una licitación en estado "${estado}"`,
      { estado, editables: ["borrador", "activa"] },
    );
  }
}

// ─────────────────────────── REGLA 3: documento ───────────────────────────

/**
 * Una licitación solo se envía (borrador → activa) si tiene propuesta adjunta.
 *
 * Se valida `documentoPath`, NO `documentoUrl`: el bucket de Storage es privado, así que
 * en la base se guarda la CLAVE del objeto y la URL firmada se genera en el momento de
 * necesitarla. Guardar el link sería guardar una credencial que expira, y la regla
 * terminaría validando una URL muerta.
 */
export function assertTieneDocumento(lic: { documentoPath: string | null }): void {
  if (!lic.documentoPath) {
    throw errores.regla(
      "DOCUMENTO_FALTANTE",
      "No se puede enviar la licitación: falta subir el documento de propuesta",
      { documentoPath: null },
    );
  }
}

// ──────────────────────────── Transiciones ────────────────────────────

/** Valida la transición contra la tabla. El mensaje lista las permitidas. */
export function assertTransicionValida(
  desde: EstadoLicitacion,
  hacia: EstadoLicitacion,
): void {
  if (desde === hacia) {
    throw errores.conflicto(
      "YA_ESTA_EN_ESTE_ESTADO",
      `La licitación ya está en estado "${hacia}"`,
      { estado: desde },
    );
  }
  if (!puedeTransicionar(desde, hacia)) {
    // La lista sale de la tabla de estados: una sola fuente de verdad para el dominio.
    const permitidas = transicionesDisponibles(desde);

    throw errores.regla(
      "TRANSICION_INVALIDA",
      `Transición inválida: ${desde} → ${hacia}. Transiciones permitidas desde "${desde}": ${
        permitidas.length ? permitidas.join(", ") : "ninguna (estado terminal)"
      }`,
      { desde, hacia, permitidas },
    );
  }
}

/**
 * Requisitos adicionales SOLO al enviar (borrador → activa).
 *
 * Se separa de `assertTransicionValida` a propósito: la tabla dice qué transiciones existen,
 * esto dice qué condiciones deben cumplirse para la transición que dispara el correo.
 * Si mandás una licitación sin documento a `perdida`, la transición es válida y este
 * chequeo ni la mira.
 */
export function assertPuedeEnviar(lic: LicitacionReglas, ahora: Date = new Date()): void {
  assertTransicionValida(lic.estado, "activa");
  assertTieneDocumento(lic);

  if (lic.fechaLimite <= ahora) {
    throw errores.regla(
      "FECHA_LIMITE_VENCIDA",
      `No se puede enviar: la fecha límite (${lic.fechaLimite.toISOString()}) ya venció`,
      { fechaLimite: lic.fechaLimite },
    );
  }
}

// ────────────────────────── REGLA 6: pagos y saldo ──────────────────────────

/** Resumen de la cuenta de una licitación. */
export type Saldo = {
  facturado: number;
  pagado: number;
  saldo: number;
  saldado: boolean;
};

/**
 * Saldo pendiente = monto facturado − suma de pagos.
 *
 * `saldado` es `saldo <= 0`, no `=== 0`: por construcción nunca debería ser negativo
 * (el pago se valida contra el saldo antes de insertarse), así que un negativo es un bug.
 * Detectarlo acá hace que se note en vez de esconderse con un `Math.max(0, ...)`.
 */
export function calcularSaldo(montoFacturado: number, pagos: number[] | number): Saldo {
  const pagado = Array.isArray(pagos) ? pagos.reduce((a, b) => a + b, 0) : pagos;
  const saldo = montoFacturado - pagado;
  return { facturado: montoFacturado, pagado, saldo, saldado: saldo <= 0 };
}

/** Solo se registran pagos en `por_cobrar`. */
export function assertPuedePagar(estado: EstadoLicitacion): void {
  if (estado !== "por_cobrar") {
    throw errores.conflicto(
      "ESTADO_INVALIDO_PAGO",
      `Solo se pueden registrar pagos en estado "por_cobrar" (estado actual: "${estado}")`,
      { estado },
    );
  }
}

/** El monto del pago debe ser > 0 y no puede superar el saldo pendiente. */
export function assertPagoValido(monto: number, saldo: number): void {
  if (!Number.isInteger(monto)) {
    throw errores.regla(
      "MONTO_NO_ENTERO",
      "El monto debe ser un entero en centavos",
      { monto },
    );
  }
  if (monto <= 0) {
    throw errores.regla("MONTO_INVALIDO", "El monto del pago debe ser mayor a cero", { monto });
  }
  if (monto > saldo) {
    throw errores.regla(
      "PAGO_EXCEDE_SALDO",
      `El pago de ${formatear(monto)} supera el saldo pendiente de ${formatear(saldo)}`,
      { monto, saldo, diferencia: monto - saldo },
    );
  }
}
