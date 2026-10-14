import Link from "next/link";
import { BotonSalir } from "./boton-salir";

/**
 * Cabecera compartida de todas las pantallas internas.
 *
 * Centralizarla evita que el encabezado se vea distinto en cada página y que el logout
 * se implemente de cinco maneras diferentes.
 *
 * La franja superior de color (azul → naranja → tierra) marca la identidad de la
 * aplicación sin usar degradados en los controles: el color se concentra acá y el resto
 * de la interfaz queda en tonos neutros cálidos.
 */

const SECCIONES = [
  { href: "/dashboard", texto: "Panel" },
  { href: "/licitaciones", texto: "Licitaciones" },
  { href: "/clientes", texto: "Clientes" },
  { href: "/productos", texto: "Productos" },
];

export function Cabecera({
  titulo,
  descripcion,
  usuario,
  rol,
  activa,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  usuario?: string;
  rol?: string;
  /** Ruta actual, para marcar la sección activa en la navegación. */
  activa?: string;
  /** Contenido extra a la derecha (botones de acción de la página). */
  acciones?: React.ReactNode;
}) {
  const secciones = rol === "ADMIN" ? [...SECCIONES, { href: "/usuarios", texto: "Usuarios" }] : SECCIONES;

  return (
    <header className="border-b border-tierra-200 bg-white">
      {/* Franja de identidad: los tres colores de la paleta en una sola barra. */}
      <div className="h-1.5 w-full bg-azul-800" />
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-azul-700 text-sm font-bold text-white">
            SL
          </span>
          <span className="text-sm font-semibold tracking-tight text-azul-900">
            Sistema de Licitaciones
          </span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {secciones.map((s) => {
            const esActiva = activa === s.href;
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={esActiva ? "page" : undefined}
                className={
                  esActiva
                    ? "rounded-md bg-azul-700 px-3 py-1.5 text-sm font-medium text-white"
                    : "rounded-md px-3 py-1.5 text-sm font-medium text-tierra-600 hover:bg-tierra-100 hover:text-tierra-900"
                }
              >
                {s.texto}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {usuario && (
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-tierra-800">{usuario}</p>
              <p className="text-xs leading-tight text-tierra-500">{rol}</p>
            </div>
          )}
          <BotonSalir />
        </div>
      </div>
    </header>
  );
}

/** Título de página, debajo de la cabecera. */
export function TituloPagina({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pt-6 pb-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-azul-900">{titulo}</h1>
        {descripcion && <p className="mt-0.5 text-sm text-tierra-600">{descripcion}</p>}
      </div>
    </div>
  );
}

/** Navegación secundaria para pantallas angostas, donde la barra principal no entra. */
export function NavegacionMovil({ activa }: { activa?: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-tierra-200 bg-white px-6 py-2 sm:hidden">
      {SECCIONES.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className={
            activa === s.href
              ? "shrink-0 rounded-md bg-azul-700 px-3 py-1.5 text-sm font-medium text-white"
              : "shrink-0 rounded-md px-3 py-1.5 text-sm text-tierra-600 hover:bg-tierra-100"
          }
        >
          {s.texto}
        </Link>
      ))}
    </nav>
  );
}
