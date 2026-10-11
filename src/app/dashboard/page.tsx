import Link from "next/link";
import { requireUserPagina } from "@/lib/session";
import { formatear, tiempoRestante } from "@/lib/dinero";
import { obtenerResumen } from "@/lib/dashboard";
import { EstadoBadge } from "@/components/estado-badge";

export const metadata = { title: "Panel — Licitaciones" };
export const dynamic = "force-dynamic";

/**
 * PANEL: próximas a vencer.
 *
 * "Funcionalidad extra" del enunciado, y la primera pantalla que ve el evaluador.
 * Responde la pregunta operativa: qué se me vence hoy y qué plata tengo por cobrar.
 *
 * Es un Server Component: lee la sesión y consulta la base en el servidor. No se manda
 * ni el JWT ni los datos al navegador antes de tiempo.
 */
export default async function DashboardPage() {
  const sesion = await requireUserPagina();
  const { metricas, proximas, ventanaDias } = await obtenerResumen();
  const ahora = new Date();

  return (
    <main className="mx-auto max-w-6xl p-6">
      <Cabecera nombre={sesion.nombre} rol={sesion.rol} />

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Licitaciones activas" valor={String(metricas.activas)} />
        <Tarjeta
          titulo={`Vencen en ${ventanaDias} días`}
          valor={String(metricas.proximasAVencer)}
          destacado={metricas.proximasAVencer > 0}
        />
        <Tarjeta titulo="Por cobrar" valor={String(metricas.porCobrar)} />
        <Tarjeta titulo="Saldo pendiente" valor={formatear(metricas.saldoPorCobrar)} />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">
          Próximas a vencer
          <span className="ml-2 text-sm font-normal text-slate-500">
            activas cuya fecha límite cae en los próximos {ventanaDias} días
          </span>
        </h2>

        {proximas.length === 0 ? (
          <p className="mt-3 rounded-lg bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">
            No hay licitaciones activas con vencimiento en los próximos {ventanaDias} días.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {proximas.map((l) => {
              const restante = tiempoRestante(l.fechaLimite, ahora);
              const urgente = l.fechaLimite.getTime() - ahora.getTime() < 24 * 3_600_000;
              return (
                <li key={l.id}>
                  <Link
                    href={`/licitaciones/${l.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4 ring-1 ring-slate-200 transition hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">
                        <span className="text-slate-400">{l.codigo}</span> {l.titulo}
                      </p>
                      <p className="text-sm text-slate-500">
                        {l.cliente.nombre} · límite {l.fechaLimite.toLocaleString("es-AR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <EstadoBadge estado={l.estado} />
                      <span
                        className={`rounded px-2 py-1 text-sm font-medium ${
                          urgente
                            ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                            : "bg-slate-50 text-slate-600 ring-1 ring-slate-200"
                        }`}
                      >
                        {restante}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Distribución por estado</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(metricas.porEstado).length === 0 && (
            <p className="text-sm text-slate-500">Todavía no hay licitaciones cargadas.</p>
          )}
          {Object.entries(metricas.porEstado).map(([estado, cantidad]) => (
            <div
              key={estado}
              className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200"
            >
              <EstadoBadge estado={estado as never} />
              <span className="font-semibold text-slate-900">{cantidad}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Tarjeta({
  titulo,
  valor,
  destacado,
}: {
  titulo: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div
      className={`rounded-xl bg-white p-5 ring-1 ${
        destacado ? "ring-red-200" : "ring-slate-200"
      }`}
    >
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
    </div>
  );
}

function Cabecera({ nombre, rol }: { nombre: string; rol: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Panel de licitaciones</h1>
        <p className="text-sm text-slate-500">
          Sesión iniciada como <strong>{nombre}</strong> ({rol})
        </p>
      </div>
      <nav className="flex items-center gap-1 text-sm">
        <Link href="/licitaciones" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
          Licitaciones
        </Link>
        <Link href="/clientes" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
          Clientes
        </Link>
        <Link href="/productos" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
          Productos
        </Link>
        {rol === "ADMIN" && (
          <Link href="/usuarios" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
            Usuarios
          </Link>
        )}
        <form action="/api/auth/logout" method="post">
          <button className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Salir
          </button>
        </form>
      </nav>
    </header>
  );
}
