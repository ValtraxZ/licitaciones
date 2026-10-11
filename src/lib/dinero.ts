/**
 * Utilidades de dinero.
 *
 * REGLA DEL PROYECTO: los montos se guardan y se calculan SIEMPRE en enteros (centavos).
 *
 * Por qué: en IEEE 754 (el tipo `float`/`number` de JavaScript) la aritmética decimal
 * no es exacta. `0.1 + 0.2 === 0.30000000000000004`. Si guardás 12.500,50 en un float y
 * lo sumás, el saldo termina con un centavo de diferencia y un test te falla sin que
 * entiendas por qué. Con enteros eso no existe: `1250050 + 1250050 = 2500100` exacto.
 *
 * Los centavos son enteros, así que acá solo se formatea para mostrar.
 */

const MONEDA = "ARS";
const LOCALE = "es-AR";

const formateador = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: MONEDA,
});

/** 1250050 -> "$ 12.500,50" */
export function formatear(centavos: number): string {
  return formateador.format(centavos / 100);
}

/** 1250050 -> "12.500,50" (sin símbolo, para tablas) */
export function formatearSinSimbolo(centavos: number): string {
  return (centavos / 100).toLocaleString(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Convierte lo que escribe el usuario ("12.500,50") a centavos enteros. */
export function aCentavos(entrada: string | number): number {
  if (typeof entrada === "number") {
    if (!Number.isInteger(entrada)) {
      throw new Error(
        `aCentavos espera centavos enteros, recibió ${entrada}. Usá formatear() para mostrar.`,
      );
    }
    return entrada;
  }
  const limpio = entrada.replace(/[^\d,-]/g, "").replace(",", ".");
  const valor = Number(limpio);
  if (Number.isNaN(valor)) throw new Error(`No se pudo interpretar el monto "${entrada}"`);
  return Math.round(valor * 100);
}

/** "36 horas", "2 días 3 h" — para mostrar cuánto falta para la fecha límite. */
export function tiempoRestante(fechaLimite: Date, ahora: Date = new Date()): string {
  const ms = fechaLimite.getTime() - ahora.getTime();
  if (ms <= 0) return "vencida";

  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return `${Math.max(1, Math.floor(ms / 60_000))} minutos`;
  if (horas < 48) return `${horas} horas`;

  const dias = Math.floor(horas / 24);
  const resto = horas % 24;
  return resto === 0 ? `${dias} días` : `${dias} días ${resto} h`;
}
