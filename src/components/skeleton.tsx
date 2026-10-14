/**
 * Esqueletos de carga.
 *
 * POR QUÉ EXISTEN
 * ---------------
 * Una navegación entre Server Components espera el render en el servidor. Medido en este
 * proyecto, un arranque en frío llega a 2-5 s (el motor de Prisma abre conexiones contra
 * un Postgres a 180 ms de latencia desde este servidor). Ese tiempo antes del primer
 * pixel se siente como "la página no cargó".
 *
 * Un esqueleto aparece al instante y comunica que algo está pasando. Es la misma razón por
 * la que un botón tiene estado `cargando`: la espera se hace visible en vez de invisible.
 *
 * Se usan bloques con `animate-pulse` y sin sombras: mismo criterio mate que el resto.
 */

function Bloque({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-tierra-200 ${className}`} />;
}

/** Pantalla completa con cabecera y tarjetas, para páginas de listado y panel. */
export function CargandoPagina({
  titulo,
  conTabla = true,
}: {
  titulo: string;
  conTabla?: boolean;
}) {
  return (
    <main className="min-h-screen">
      {/* Franja de color, para que la maquetación no salte al aparecer el contenido. */}
      <div className="h-1.5 w-full bg-azul-800" />
      <div className="border-b border-tierra-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Bloque className="h-8 w-8 rounded-md" />
          <div className="hidden gap-1 sm:flex">
            <Bloque className="h-8 w-20" />
            <Bloque className="h-8 w-24" />
            <Bloque className="h-8 w-20" />
            <Bloque className="h-8 w-20" />
          </div>
          <Bloque className="h-8 w-20" />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-16">
        <div className="pt-6 pb-4">
          <Bloque className="h-7 w-56" />
          <Bloque className="mt-2 h-4 w-80" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-tierra-200 bg-white px-5 py-4">
              <Bloque className="h-4 w-24" />
              <Bloque className="mt-2 h-7 w-16" />
            </div>
          ))}
        </div>

        {conTabla && (
          <div className="mt-6 overflow-hidden rounded-xl border border-tierra-200 bg-white">
            <div className="bg-tierra-50 px-4 py-3">
              <Bloque className="h-3 w-full" />
            </div>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 border-t border-tierra-100 px-4 py-4">
                <Bloque className="h-4 flex-1" />
                <Bloque className="h-4 w-20" />
                <Bloque className="h-4 w-16" />
                <Bloque className="h-4 w-24" />
              </div>
            ))}
          </div>
        )}

        <p className="sr-only" role="status">
          Cargando {titulo}…
        </p>
      </div>
    </main>
  );
}

/** Detalle de una licitación: columnas y panel lateral. */
export function CargandoDetalle() {
  return (
    <main className="mx-auto max-w-6xl px-6 pb-16">
      <div className="border-b border-tierra-200 pb-4 pt-6">
        <Bloque className="h-3 w-32" />
        <Bloque className="mt-2 h-8 w-96 max-w-full" />
        <Bloque className="mt-2 h-4 w-64" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-tierra-200 bg-white p-5">
              <Bloque className="h-5 w-40" />
              <Bloque className="mt-4 h-3 w-full" />
              <Bloque className="mt-2 h-3 w-4/5" />
              <Bloque className="mt-2 h-3 w-3/5" />
            </div>
          ))}
        </div>
        <div className="space-y-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-tierra-200 bg-white p-5">
              <Bloque className="h-4 w-32" />
              <Bloque className="mt-3 h-3 w-full" />
              <Bloque className="mt-2 h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>

      <p className="sr-only" role="status">
        Cargando la licitación…
      </p>
    </main>
  );
}
