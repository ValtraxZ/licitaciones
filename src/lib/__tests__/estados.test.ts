import { describe, expect, it } from "vitest";
import {
  ESTADOS,
  ESTADOS_EDITABLES,
  ESTADOS_TERMINALES,
  TRANSICIONES,
  esEditable,
  esTerminal,
  esEstadoValido,
  entraEnVentanaRecordatorio,
  debeVencer,
  puedeTransicionar,
  transicionesDisponibles,
  type EstadoLicitacion,
} from "../estados";

/** Todas las combinaciones de estado: 6 x 6 = 36 casos. */
const combinaciones: Array<[EstadoLicitacion, EstadoLicitacion]> = ESTADOS.flatMap((desde) =>
  ESTADOS.map((hacia) => [desde, hacia] as [EstadoLicitacion, EstadoLicitacion]),
);

/**
 * La tabla de transiciones escrita a mano, tal cual la pide el enunciado.
 * Vive acá a propósito: si el código cambia la tabla, este test falla. Es la
 * especificación ejecutable del requerimiento.
 */
const TABLA_DEL_ENUNCIADO: Record<EstadoLicitacion, EstadoLicitacion[]> = {
  borrador: ["activa"],
  activa: ["finalizada", "perdida"],
  finalizada: ["por_cobrar"],
  por_cobrar: ["cobrada"],
  cobrada: [],
  perdida: [],
};

describe("máquina de estados — tabla de transiciones", () => {
  it("coincide exactamente con la tabla del enunciado", () => {
    expect(TRANSICIONES).toEqual(TABLA_DEL_ENUNCIADO);
  });

  it("rechaza cualquier combinación que no esté en la tabla (36 casos)", () => {
    const invalidas = combinaciones.filter(
      ([desde, hacia]) => !TABLA_DEL_ENUNCIADO[desde].includes(hacia),
    );

    for (const [desde, hacia] of invalidas) {
      expect(puedeTransicionar(desde, hacia), `${desde} → ${hacia} debería rechazarse`).toBe(false);
    }

    // 5 transiciones válidas sobre 36 combinaciones.
    expect(invalidas).toHaveLength(36 - 5);
  });

  it("acepta las 5 transiciones del enunciado", () => {
    const validas: Array<[EstadoLicitacion, EstadoLicitacion]> = [
      ["borrador", "activa"],
      ["activa", "finalizada"],
      ["activa", "perdida"],
      ["finalizada", "por_cobrar"],
      ["por_cobrar", "cobrada"],
    ];
    for (const [desde, hacia] of validas) {
      expect(puedeTransicionar(desde, hacia), `${desde} → ${hacia} debería permitirse`).toBe(true);
    }
    expect(validas).toHaveLength(5);
  });

  it("cobrada y perdida son terminales: no tienen salida", () => {
    expect(ESTADOS_TERMINALES).toEqual(["cobrada", "perdida"]);
    for (const estado of ESTADOS_TERMINALES) {
      expect(transicionesDisponibles(estado)).toEqual([]);
    }
  });

  it("por_cobrar solo puede pasar a cobrada (transición automática)", () => {
    expect(transicionesDisponibles("por_cobrar")).toEqual(["cobrada"]);
  });

  it("nunca permite volver a un estado anterior (el grafo es acíclico)", () => {
    for (const desde of ESTADOS) {
      for (const hacia of transicionesDisponibles(desde)) {
        expect(
          puedeTransicionar(hacia, desde),
          `${desde} → ${hacia} es de ida, no debería volver de ${hacia} → ${desde}`,
        ).toBe(false);
      }
    }
  });
});

describe("estados editables", () => {
  it("solo borrador y activa permiten tocar productos", () => {
    // El enunciado: en finalizada, por_cobrar, cobrada y perdida NO se puede.
    expect(ESTADOS_EDITABLES).toEqual(["borrador", "activa"]);

    expect(esEditable("borrador")).toBe(true);
    expect(esEditable("activa")).toBe(true);

    for (const estado of ["finalizada", "por_cobrar", "cobrada", "perdida"] as const) {
      expect(esEditable(estado), `${estado} no debería ser editable`).toBe(false);
    }
  });

  it("rechaza validar un estado desconocido", () => {
    expect(esEstadoValido("borrador")).toBe(true);
    expect(esEstadoValido("cancelada")).toBe(false);
    expect(esEstadoValido("")).toBe(false);
  });
});

describe("lógica basada en tiempo", () => {
  const ahora = new Date("2026-06-01T12:00:00Z");
  const horas = (n: number) => new Date(ahora.getTime() + n * 3_600_000);

  it("una activa vencida debe pasar a perdida (requisito 2)", () => {
    expect(debeVencer({ fechaLimite: horas(-1) }, ahora)).toBe(true);
    expect(debeVencer({ fechaLimite: ahora }, ahora)).toBe(false);
    expect(debeVencer({ fechaLimite: horas(1) }, ahora)).toBe(false);
  });

  it("el recordatorio entra solo en la ventana de 48 h (requisito 5)", () => {
    // 30 h antes: dentro de la ventana, y sin recordatorio previo.
    expect(entraEnVentanaRecordatorio({ fechaLimite: horas(30), recordatorioEnviadoEn: null }, ahora)).toBe(true);
    // 12 h antes: también dentro.
    expect(entraEnVentanaRecordatorio({ fechaLimite: horas(12), recordatorioEnviadoEn: null }, ahora)).toBe(true);
    // 72 h antes: FUERA de la ventana, igual mandaría recordatorio de más.
    expect(entraEnVentanaRecordatorio({ fechaLimite: horas(72), recordatorioEnviadoEn: null }, ahora)).toBe(false);
    // Ya venció: el paso 1 del cron la pasó a perdida, no se avisa.
    expect(entraEnVentanaRecordatorio({ fechaLimite: horas(-1), recordatorioEnviadoEn: null }, ahora)).toBe(false);
  });

  it("no repite el recordatorio si ya se envió (idempotencia del cron)", () => {
    // Sin este caso, cada corrida del cron reenvía el mail y el cliente bloquea al remitente.
    expect(
      entraEnVentanaRecordatorio(
        { fechaLimite: horas(10), recordatorioEnviadoEn: new Date("2026-05-31T10:00:00Z") },
        ahora,
      ),
    ).toBe(false);
  });

  it("los dos límites de la ventana son estrictos", () => {
    // Justo en el borde de 48 h no entra (límite superior estricto).
    expect(entraEnVentanaRecordatorio({ fechaLimite: horas(48), recordatorioEnviadoEn: null }, ahora)).toBe(false);
    // Justo en "ahora" no entra (límite inferior estricto).
    expect(entraEnVentanaRecordatorio({ fechaLimite: ahora, recordatorioEnviadoEn: null }, ahora)).toBe(false);
  });
});
