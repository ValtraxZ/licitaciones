/**
 * Estilos compartidos de la interfaz.
 *
 * Centralizarlos en constantes evita que el mismo botón aparezca con tres tonos distintos
 * en tres pantallas, y permite cambiar la paleta entera tocando un solo archivo.
 *
 * ACABADO MATE: rellenos sólidos, bordes definidos y cambio de tono al pasar el cursor.
 * Sin degradados ni sombras brillantes: en una herramienta de trabajo el brillo
 * compite con el contenido.
 */

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium " +
  "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";

/** Acción principal: azul institucional. */
export const btnPrimario = `${base} bg-azul-700 text-white hover:bg-azul-800`;

/** Acción de acento: naranja. Para lo que cambia el estado de una licitación. */
export const btnAcento = `${base} bg-naranja-600 text-white hover:bg-naranja-700`;

/** Acción secundaria: contorno sobre fondo claro. */
export const btnSecundario = `${base} border border-tierra-300 bg-white text-tierra-700 hover:bg-tierra-100`;

/** Acción discreta: solo texto, para navegación y acciones menores. */
export const btnFantasma = `${base} text-tierra-600 hover:bg-tierra-100 hover:text-tierra-900`;

/** Acción destructiva: naranja apagado. */
export const btnPeligro = `${base} border border-naranja-300 bg-naranja-50 text-naranja-800 hover:bg-naranja-100`;

/** Contenedor de tabla y tarjeta: fondo blanco, borde cálido, sin sombra pesada. */
export const panel = "rounded-xl border border-tierra-200 bg-white";

/** Etiqueta sobre un panel. */
export const etiquetaPanel = "text-xs font-medium uppercase tracking-wide text-tierra-500";

/** Input de formulario. */
export const input =
  "mt-1 w-full rounded-md border border-tierra-300 bg-white px-3 py-2 text-sm text-tierra-900 " +
  "placeholder:text-tierra-400 focus:border-azul-500 focus:ring-2 focus:ring-azul-100 focus:outline-none";

/** Mensaje de error. */
export const alertaError =
  "rounded-md border border-naranja-300 bg-naranja-50 px-3 py-2 text-sm text-naranja-900";
