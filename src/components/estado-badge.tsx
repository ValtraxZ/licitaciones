import { ETIQUETA_ESTADO, type EstadoLicitacion } from "@/lib/estados";

/**
 * Badge de estado de la licitación.
 *
 * Los colores están acá y no se calculan: el estado es un dato, no una decisión de UI.
 * `aria-label` describe el color para lectores de pantalla, porque el color por sí solo
 * no comunica nada a quien no lo ve.
 */
const ESTILOS: Record<EstadoLicitacion, string> = {
  borrador: "bg-slate-100 text-slate-700 ring-slate-200",
  activa: "bg-blue-50 text-blue-700 ring-blue-200",
  finalizada: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  por_cobrar: "bg-amber-50 text-amber-700 ring-amber-200",
  cobrada: "bg-green-100 text-green-800 ring-green-300",
  perdida: "bg-red-50 text-red-700 ring-red-200",
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

/** Etiqueta del origen de una transición del historial. */
export function OrigenBadge({ origen }: { origen: "manual" | "automatica" | "sistema" }) {
  const config = {
    manual: { texto: "Manual", clase: "bg-slate-100 text-slate-600 ring-slate-200" },
    automatica: { texto: "Sistema · vencimiento", clase: "bg-purple-50 text-purple-700 ring-purple-200" },
    sistema: { texto: "Sistema · saldo cero", clase: "bg-cyan-50 text-cyan-700 ring-cyan-200" },
  }[origen];

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${config.clase}`}
    >
      {config.texto}
    </span>
  );
}
