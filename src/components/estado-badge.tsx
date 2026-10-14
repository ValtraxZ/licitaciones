import { ETIQUETA_ESTADO, type EstadoLicitacion } from "@/lib/estados";

/**
 * Badges de estado.
 *
 * Los colores viven acá y no se calculan en cada página: el estado es un dato del
 * dominio, no una decisión de presentación. La paleta es la de la app (azul, naranja,
 * tierra) y es MATE: rellenos suaves con anillo del mismo tono, sin sombras.
 */

const ESTILOS: Record<EstadoLicitacion, string> = {
  borrador: "bg-tierra-100 text-tierra-700 ring-tierra-300",
  activa: "bg-azul-100 text-azul-800 ring-azul-300",
  finalizada: "bg-azul-50 text-azul-700 ring-azul-200",
  por_cobrar: "bg-naranja-100 text-naranja-900 ring-naranja-300",
  cobrada: "bg-azul-700 text-white ring-azul-700",
  perdida: "bg-tierra-200 text-tierra-800 ring-tierra-400",
};

export function EstadoBadge({ estado }: { estado: EstadoLicitacion }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${ESTILOS[estado]}`}
    >
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

/**
 * Etiqueta del origen de una transición del historial.
 *
 * Distingue las automáticas de las manuales: es la demostración visual de que el
 * sistema puede transicionar una licitación sin intervención humana.
 */
export function OrigenBadge({ origen }: { origen: "manual" | "automatica" | "sistema" }) {
  const config = {
    manual: { texto: "Manual", clase: "bg-tierra-100 text-tierra-700 ring-tierra-300" },
    automatica: {
      texto: "Sistema · vencimiento",
      clase: "bg-naranja-100 text-naranja-900 ring-naranja-300",
    },
    sistema: { texto: "Sistema · saldo cero", clase: "bg-azul-100 text-azul-800 ring-azul-300" },
  }[origen];

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${config.clase}`}
    >
      {config.texto}
    </span>
  );
}

/** Rol del usuario: el azul reservado para ADMIN lo hace notar de un vistazo. */
export function EstadoRol({ rol }: { rol: "ADMIN" | "USER" }) {
  return (
    <span
      className={
        rol === "ADMIN"
          ? "inline-flex items-center rounded-full bg-azul-700 px-2.5 py-0.5 text-xs font-medium text-white"
          : "inline-flex items-center rounded-full bg-tierra-100 px-2.5 py-0.5 text-xs font-medium text-tierra-700 ring-1 ring-inset ring-tierra-300"
      }
    >
      {rol === "ADMIN" ? "Administrador" : "Usuario"}
    </span>
  );
}
