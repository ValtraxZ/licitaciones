import { describe, expect, it } from "vitest";
import { ErrorNegocio } from "../errores";
import {
  assertDentroDePresupuesto,
  assertEditable,
  assertPagoValido,
  assertPuedeEnviar,
  assertPuedePagar,
  assertTieneDocumento,
  assertTransicionValida,
  calcularSaldo,
  deltaSubtotal,
  excedePresupuesto,
  presupuestoDisponible,
  totalConItem,
  type LicitacionReglas,
} from "../reglas";

/** Helper: ejecuta fn y devuelve el ErrorNegocio que lanzó. */
function capturarError(fn: () => void): ErrorNegocio {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErrorNegocio) return e;
    throw e;
  }
  throw new Error("Se esperaba un ErrorNegocio y no se lanzó ninguno");
}

// ───────────────── REGLA 1: no exceder el presupuesto máximo ─────────────────

describe("Regla 1 — presupuesto máximo", () => {
  const MAXIMO = 1_000_000; // $10.000,00

  it("permite agregar mientras el total no supere el máximo", () => {
    expect(() => assertDentroDePresupuesto(0, 999_999, MAXIMO)).not.toThrow();
    // Justo en el límite: permitido (el enunciado dice "no debe superar").
    expect(() => assertDentroDePresupuesto(0, MAXIMO, MAXIMO)).not.toThrow();
  });

  it("rechaza un centavo por encima del máximo", () => {
    const err = capturarError(() => assertDentroDePresupuesto(0, MAXIMO + 1, MAXIMO));
    expect(err.status).toBe(422);
    expect(err.code).toBe("PRESUPUESTO_EXCEDIDO");
    expect(err.details).toMatchObject({ presupuestoMaximo: MAXIMO, excedente: 1 });
  });

  it("el error dice cuántos centavos se exceden", () => {
    const err = capturarError(() => assertDentroDePresupuesto(800_000, 1_200_000, MAXIMO));
    expect(err.details).toMatchObject({ totalActual: 800_000, totalNuevo: 1_200_000, excedente: 200_000 });
    expect(err.message).toContain("presupuesto máximo");
  });

  it("permite quitar productos (bajar el total nunca excede)", () => {
    expect(() => assertDentroDePresupuesto(900_000, 400_000, MAXIMO)).not.toThrow();
  });
});

describe("cálculo del total al agregar productos", () => {
  it("un producto nuevo suma su subtotal completo", () => {
    // 10 x $1.200,00 = $12.000,00 = 1.200.000 centavos
    expect(deltaSubtotal(10, 120_000, 0)).toBe(1_200_000);
  });

  it("un producto que YA estaba resta su subtotal anterior (no lo cuenta dos veces)", () => {
    // Este es el bug clásico: sumar sin restar el previo falsea el presupuesto.
    // El producto valía 5 x 100.000 = 500.000 y ahora son 10 x 100.000 = 1.000.000.
    // El delta correcto es 500.000, no 1.000.000.
    expect(deltaSubtotal(10, 100_000, 500_000)).toBe(500_000);
    expect(totalConItem(500_000, 10, 100_000, 500_000)).toBe(1_000_000);
  });

  it("reducir la cantidad de un producto existente baja el total", () => {
    // Bajan de 10 a 3 unidades: el delta es negativo.
    expect(deltaSubtotal(3, 100_000, 1_000_000)).toBe(-700_000);
  });

  it("suma varios ítems sin perder precisión de centavos", () => {
    // 0.1 + 0.2 en float daría 0.30000000000000004. Con enteros es exacto.
    const items = [1, 2, 3, 7, 11, 101];
    const total = items.reduce((acc, n) => totalConItem(acc, 1, n, 0), 0);
    expect(total).toBe(125);
  });
});

describe("presupuesto disponible", () => {
  it("es la diferencia entre el máximo y lo consumido", () => {
    expect(presupuestoDisponible({ totalProductos: 250_000, presupuestoMaximo: 1_000_000 })).toBe(750_000);
  });

  it("nunca es negativo aunque se haya excedido (dato sucio de la base)", () => {
    expect(presupuestoDisponible({ totalProductos: 1_500_000, presupuestoMaximo: 1_000_000 })).toBe(0);
  });

  it("excedePresupuesto anticipa el error en la UI", () => {
    const lic = { totalProductos: 900_000, presupuestoMaximo: 1_000_000 };
    expect(excedePresupuesto(lic, 1, 50_000)).toBe(false); // 950.000: entra
    expect(excedePresupuesto(lic, 1, 200_000)).toBe(true); // 1.100.000: no entra
  });
});

// ────────────────────── Regla: solo borrador y activa ──────────────────────

describe("editabilidad de la licitación", () => {
  it("permite tocar productos en borrador y activa", () => {
    expect(() => assertEditable("borrador")).not.toThrow();
    expect(() => assertEditable("activa")).not.toThrow();
  });

  it("bloquea con 409 en los cuatro estados cerrados", () => {
    for (const estado of ["finalizada", "por_cobrar", "cobrada", "perdida"] as const) {
      const err = capturarError(() => assertEditable(estado));
      expect(err.status, `${estado} debería dar 409`).toBe(409);
      expect(err.code).toBe("NO_EDITABLE");
    }
  });
});

// ───────────────────────── REGLA 3: documento ─────────────────────────

describe("Regla 3 — no enviar sin documento de propuesta", () => {
  it("permite enviar con documento adjunto", () => {
    expect(() => assertTieneDocumento({ documentoUrl: "https://x.supabase.co/p.pdf" })).not.toThrow();
  });

  it("rechaza con 422 si no hay documento", () => {
    const err = capturarError(() => assertTieneDocumento({ documentoUrl: null }));
    expect(err.status).toBe(422);
    expect(err.code).toBe("DOCUMENTO_FALTANTE");
  });
});

// ────────────────────────── Transiciones ──────────────────────────

describe("validación de transiciones", () => {
  it("acepta las transiciones válidas", () => {
    expect(() => assertTransicionValida("borrador", "activa")).not.toThrow();
    expect(() => assertTransicionValida("activa", "perdida")).not.toThrow();
    expect(() => assertTransicionValida("por_cobrar", "cobrada")).not.toThrow();
  });

  it("rechaza saltar de borrador a finalizada", () => {
    const err = capturarError(() => assertTransicionValida("borrador", "finalizada"));
    expect(err.code).toBe("TRANSICION_INVALIDA");
    expect(err.message).toContain("activa"); // lista lo que sí se puede hacer
  });

  it("rechaza volver hacia atrás", () => {
    expect(capturarError(() => assertTransicionValida("cobrada", "por_cobrar")).code).toBe("TRANSICION_INVALIDA");
    expect(capturarError(() => assertTransicionValida("perdida", "activa")).code).toBe("TRANSICION_INVALIDA");
  });

  it("distingue 'ya está en ese estado' (409) de 'transición inválida' (422)", () => {
    const err = capturarError(() => assertTransicionValida("activa", "activa"));
    expect(err.status).toBe(409);
    expect(err.code).toBe("YA_ESTA_EN_ESTE_ESTADO");
  });

  it("informa que un estado terminal no tiene salida", () => {
    const err = capturarError(() => assertTransicionValida("perdida", "activa"));
    expect(err.message).toContain("estado terminal");
  });
});

describe("Regla 3 aplicada al envío (borrador → activa)", () => {
  const base: LicitacionReglas = {
    estado: "borrador",
    presupuestoMaximo: 1_000_000,
    totalProductos: 500_000,
    montoFacturado: 0,
    documentoUrl: "https://x.supabase.co/p.pdf",
    fechaLimite: new Date("2026-07-01T12:00:00Z"),
  };
  const ahora = new Date("2026-06-01T12:00:00Z");

  it("permite enviar un borrador completo y con plazo vigente", () => {
    expect(() => assertPuedeEnviar(base, ahora)).not.toThrow();
  });

  it("bloquea el envío sin documento", () => {
    expect(capturarError(() => assertPuedeEnviar({ ...base, documentoUrl: null }, ahora)).code).toBe("DOCUMENTO_FALTANTE");
  });

  it("bloquea el envío con la fecha límite ya vencida", () => {
    const err = capturarError(() => assertPuedeEnviar({ ...base, fechaLimite: new Date("2026-05-01T12:00:00Z") }, ahora));
    expect(err.code).toBe("FECHA_LIMITE_VENCIDA");
  });

  it("bloquea el envío si la licitación no está en borrador", () => {
    expect(capturarError(() => assertPuedeEnviar({ ...base, estado: "activa" }, ahora)).code).toBe("YA_ESTA_EN_ESTE_ESTADO");
    expect(capturarError(() => assertPuedeEnviar({ ...base, estado: "perdida" }, ahora)).code).toBe("TRANSICION_INVALIDA");
  });
});

// ──────────────────────── REGLA 6: pagos y saldo ────────────────────────

describe("Regla 6 — saldo pendiente", () => {
  it("saldo = facturado − suma de pagos", () => {
    expect(calcularSaldo(1_000_000, [400_000, 300_000])).toEqual({
      facturado: 1_000_000,
      pagado: 700_000,
      saldo: 300_000,
      saldado: false,
    });
  });

  it("llegar a cero saldo marca saldado (dispara cobrada)", () => {
    expect(calcularSaldo(1_000_000, [600_000, 400_000]).saldado).toBe(true);
    expect(calcularSaldo(1_000_000, [1_000_000]).saldo).toBe(0);
  });

  it("acepta el total pagado como número o como lista", () => {
    expect(calcularSaldo(1_000_000, 1_000_000).saldado).toBe(true);
    expect(calcularSaldo(1_000_000, 0).saldo).toBe(1_000_000);
  });

  it("sin pagos, el saldo es el total facturado", () => {
    expect(calcularSaldo(850_000, [])).toMatchObject({ pagado: 0, saldo: 850_000, saldado: false });
  });

  it("detecta saldo negativo en vez de esconderlo", () => {
    // No debería pasar (el pago se valida antes de insertar). Si aparece, es un bug
    // y tiene que verse, no quedar clampeado a 0.
    expect(calcularSaldo(1_000_000, [1_200_000])).toMatchObject({ saldo: -200_000, saldado: true });
  });
});

describe("Regla 6 — validación del pago", () => {
  it("solo acepta pagos en estado por_cobrar", () => {
    expect(() => assertPuedePagar("por_cobrar")).not.toThrow();
    for (const estado of ["borrador", "activa", "finalizada", "cobrada", "perdida"] as const) {
      const err = capturarError(() => assertPuedePagar(estado));
      expect(err.status).toBe(409);
      expect(err.code).toBe("ESTADO_INVALIDO_PAGO");
    }
  });

  it("acepta un pago igual al saldo exacto", () => {
    expect(() => assertPagoValido(300_000, 300_000)).not.toThrow();
  });

  it("rechaza un centavo más que el saldo", () => {
    const err = capturarError(() => assertPagoValido(300_001, 300_000));
    expect(err.status).toBe(422);
    expect(err.code).toBe("PAGO_EXCEDE_SALDO");
    expect(err.details).toMatchObject({ saldo: 300_000, diferencia: 1 });
  });

  it("rechaza montos cero, negativos o no enteros", () => {
    expect(capturarError(() => assertPagoValido(0, 300_000)).code).toBe("MONTO_INVALIDO");
    expect(capturarError(() => assertPagoValido(-500, 300_000)).code).toBe("MONTO_INVALIDO");
    // Un float rompe la aritmética de centavos: se rechaza antes de tocar la base.
    expect(capturarError(() => assertPagoValido(100.5, 300_000)).code).toBe("MONTO_NO_ENTERO");
  });

  it("pago parcial: no marca saldado hasta cubrir el total", () => {
    const total = 1_000_000;
    let pagado = 0;
    for (const cuota of [400_000, 300_000]) {
      assertPagoValido(cuota, total - pagado);
      pagado += cuota;
    }
    expect(calcularSaldo(total, pagado).saldado).toBe(false);

    const ultima = total - pagado;
    assertPagoValido(ultima, ultima);
    expect(calcularSaldo(total, pagado + ultima).saldado).toBe(true);
  });
});
