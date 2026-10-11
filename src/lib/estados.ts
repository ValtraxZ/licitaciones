/**
 * MÁQUINA DE ESTADOS DE LA LICITACIÓN
 * ===================================
 * Este archivo es la fuente de verdad del dominio. Si tenés que cambiar cómo se comporta
 * una transición, se cambia acá y en ningún otro lado.
 *
 * POR QUÉ UNA TABLA Y NO UN `if` POR ENDPOINT
 * -------------------------------------------
 * El enunciado define 5 transiciones válidas y dice que "cualquier otra combinación debe
 * rechazarse con error". Con un `if` repartido en 5 endpoints la regla queda implícita:
 * hay que leer los 5 archivos para saber qué se permite. Con una tabla, la regla completa
 * se lee en una pantalla, es trivial de testear (son funciones puras) y no se puede
 * desincronizar del dominio.
 *
 * Además `transicionesDisponibles()` la consume el frontend para decidir qué botones
 * mostrar. Si el frontend reimplementara la tabla, el día que agregues un estado vas a
 * tener un botón que el backend rechaza con 422.
 */

export const ESTADOS = [
  "borrador",
  "activa",
  "finalizada",
  "por_cobrar",
  "cobrada",
  "perdida",
] as const;

export type EstadoLicitacion = (typeof ESTADOS)[number];

/**
 * Tabla de transiciones válidas.
 *
 *  borrador   → activa       Requisito 3: solo si tiene documento de propuesta adjunto.
 *                             Dispara el correo al cliente (requisito 4).
 *  activa     → finalizada   La empresa ganó y completó la entrega.
 *  activa     → perdida      Manual (no se ganó) o automática (se venció la fecha límite).
 *  finalizada → por_cobrar   Se facturó, queda pendiente el cobro.
 *  por_cobrar → cobrada      AUTOMÁTICA: se dispara sola cuando el saldo llega a cero.
 *                             No es un endpoint. Si el usuario la puede forzar, el modelo
 *                             se rompe: alguien "cobra" una licitación que debe plata.
 *  cobrada    → (ninguna)    Estado terminal.
 *  perdida    → (ninguna)    Estado terminal.
 */
export const TRANSICIONES: Record<EstadoLicitacion, EstadoLicitacion[]> = {
  borrador: ["activa"],
  activa: ["finalizada", "perdida"],
  finalizada: ["por_cobrar"],
  por_cobrar: ["cobrada"],
  cobrada: [],
  perdida: [],
};

/**
 * Estados en los que se pueden agregar o quitar productos.
 *
 * El enunciado dice que en `finalizada`, `por_cobrar`, `cobrada` y `perdida` NO se
 * permite. Quedan `borrador` y `activa`. Misma lista para cambiar el documento de
 * propuesta: una licitación cerrada es inmutable.
 */
export const ESTADOS_EDITABLES: EstadoLicitacion[] = ["borrador", "activa"];

/** Estados que representan un proceso ya cerrado (no admiten más movimientos). */
export const ESTADOS_TERMINALES: EstadoLicitacion[] = ["cobrada", "perdida"];

/** Etiquetas para mostrar en la UI. La tabla no se duplica: solo se leen los valores. */
export const ETIQUETA_ESTADO: Record<EstadoLicitacion, string> = {
  borrador: "Borrador",
  activa: "Activa",
  finalizada: "Finalizada",
  por_cobrar: "Por cobrar",
  cobrada: "Cobrada",
  perdida: "Perdida",
};

// ───────────────────────────── Predicados ─────────────────────────────

export function puedeTransicionar(
  desde: EstadoLicitacion,
  hacia: EstadoLicitacion,
): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

export function esEditable(estado: EstadoLicitacion): boolean {
  return ESTADOS_EDITABLES.includes(estado);
}

export function esTerminal(estado: EstadoLicitacion): boolean {
  return ESTADOS_TERMINALES.includes(estado);
}

export function transicionesDisponibles(estado: EstadoLicitacion): EstadoLicitacion[] {
  return TRANSICIONES[estado];
}

export function esEstadoValido(valor: string): valor is EstadoLicitacion {
  return (ESTADOS as readonly string[]).includes(valor);
}

// ───────────────────────── Contexto temporal ─────────────────────────

/** Ventana del recordatorio: menos de 48 h para la fecha límite (requisito 5). */
export const HORAS_RECORDATORIO = 48;

/**
 * ¿Esta licitación activa entra en la ventana de recordatorio?
 *
 * Los tres límites son obligatorios:
 *   - `> ahora`: si ya venció, el paso 1 del cron la transitioned a `perdida` y no
 *     tiene sentido mandar "¡te quedan horas!" de algo vencido.
 *   - `< ahora + 48h`: sin este límite el cron recordaría licitaciones que vencen en 30 días.
 *   - `recordatorioEnviadoEn == null`: sin este flag, cada corrida del cron reenvía
 *     el recordatorio y el cliente termina bloqueando al remitente.
 */
export function entraEnVentanaRecordatorio(
  lic: { fechaLimite: Date; recordatorioEnviadoEn: Date | null },
  ahora: Date,
): boolean {
  const limite = new Date(ahora.getTime() + HORAS_RECORDATORIO * 3_600_000);
  return lic.fechaLimite > ahora && lic.fechaLimite < limite && !lic.recordatorioEnviadoEn;
}

/** ¿Esta licitación activa debe vencer automáticamente? (requisito 2) */
export function debeVencer(lic: { fechaLimite: Date }, ahora: Date): boolean {
  return lic.fechaLimite < ahora;
}
