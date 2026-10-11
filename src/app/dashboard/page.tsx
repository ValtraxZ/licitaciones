import { requireUserPagina } from "@/lib/session";
import { formatear } from "@/lib/dinero";

/**
 * Panel provisional.
 *
 * Sirve para dos cosas: comprobar que la auth anda de punta a punta (llegar acá exige
 * cookie válida) y tener un lugar donde mostrar la sesión activa.
 * Lo reemplaza el dashboard real con las licitaciones próximas a vencer.
 */
export const metadata = { title: "Panel — Licitaciones" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Si no hay sesión, redirige a /login. Es la guarda de página; los endpoints
  // tienen su propia guarda con requireUser().
  const sesion = await requireUserPagina();

  return (
    <main className="mx-auto max-w-4xl p-8">
      <header className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Panel de licitaciones</h1>
          <p className="text-sm text-slate-500">
            Sesión iniciada como <strong>{sesion.nombre}</strong> ({sesion.rol})
          </p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Salir
          </button>
        </form>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <Tarjeta titulo="Monto facturado pendiente" valor={formatear(0)} />
        <Tarjeta titulo="Licitaciones activas" valor="0" />
        <Tarjeta titulo="Próximas a vencer" valor="0" />
      </section>

      <p className="mt-8 rounded-md bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
        Panel provisional. Acá va el listado de licitaciones activas con fecha límite
        próxima, con el contador de días y horas que le falta a cada una.
      </p>
    </main>
  );
}

function Tarjeta({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
    </div>
  );
}
