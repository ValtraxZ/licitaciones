import { obtenerResumen } from "@/lib/dashboard";
import { requireUserPagina } from "@/lib/session";
import { formatear, tiempoRestante } from "@/lib/dinero";
import { EstadoBadge } from "@/components/estado-badge";
import { Cabecera, NavegacionMovil, TituloPagina } from "@/components/cabecera";
import { panel } from "@/lib/ui";
import Link from "next/link";

export const metadata = { title: "Panel — Licitaciones" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const sesion = await requireUserPagina();
  const { metricas, proximas, ventanaDias } = await obtenerResumen();
  const ahora = new Date();

  return (
    <main className="min-h-screen">
      <Cabecera titulo="Panel" usuario={sesion.nombre} rol={sesion.rol} activa="/dashboard" />
      <NavegacionMovil activa="/dashboard" />

      <div className="mx-auto max-w-6xl px-6 pb-16">
        <TituloPagina
          titulo="Panel de licitaciones"
          descripcion="Resumen de carteras, próximos vencimientos y saldos pendientes."
        />

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tarjeta titulo="Licitaciones activas" valor={String(metricas.activas)} tono="azul" />
          <Tarjeta
            titulo={`Vencen en ${ventanaDias} días`}
            valor={String(metricas.proximasAVencer)}
            tono="naranja"
            destacado={metricas.proximasAVencer > 0}
          />
          <Tarjeta titulo="Por cobrar" valor={String(metricas.porCobrar)} tono="tierra" />
          <Tarjeta titulo="Saldo pendiente" valor={formatear(metricas.saldoPorCobrar)} tono="azul" />
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-azul-900">Próximas a vencer</h2>
          <p className="text-sm text-tierra-600">
            Licitaciones activas cuya fecha límite cae en los próximos {ventanaDias} días.
          </p>

          {proximas.length === 0 ? (
            <div className={`${panel} mt-3 px-5 py-8 text-center text-sm text-tierra-500`}>
              No hay licitaciones activas con vencimiento en los próximos {ventanaDias} días.
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {proximas.map((l) => {
                const restante = tiempoRestante(l.fechaLimite, ahora);
                const urgente = l.fechaLimite.getTime() - ahora.getTime() < 24 * 3_600_000;
                return (
                  <li key={l.id}>
                    <Link
                      href={`/licitaciones/${l.id}`}
                      className={`${panel} flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-tierra-50`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-tierra-900">
                          <span className="text-tierra-400">{l.codigo}</span> {l.titulo}
                        </p>
                        <p className="text-sm text-tierra-600">
                          {l.cliente.nombre} · límite {l.fechaLimite.toLocaleString("es-AR")}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <EstadoBadge estado={l.estado} />
                        <span
                          className={
                            urgente
                              ? "rounded bg-naranja-600 px-2 py-1 text-sm font-medium text-white"
                              : "rounded bg-tierra-100 px-2 py-1 text-sm font-medium text-tierra-700"
                          }
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
          <h2 className="text-lg font-semibold text-azul-900">Distribución por estado</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(metricas.porEstado).length === 0 && (
              <p className="text-sm text-tierra-500">Todavía no hay licitaciones cargadas.</p>
            )}
            {Object.entries(metricas.porEstado).map(([estado, cantidad]) => (
              <div
                key={estado}
                className={`${panel} flex items-center gap-2 px-3 py-2 text-sm`}
              >
                <EstadoBadge estado={estado as never} />
                <span className="font-semibold tabular-nums text-tierra-900">{cantidad}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Tarjeta({
  titulo,
  valor,
  tono,
  destacado,
}: {
  titulo: string;
  valor: string;
  tono: "azul" | "naranja" | "tierra";
  destacado?: boolean;
}) {
  const bordes = {
    azul: "border-l-azul-700",
    naranja: "border-l-naranja-600",
    tierra: "border-l-tierra-400",
  }[tono];

  const valorColor = destacado ? "text-naranja-700" : "text-azul-900";

  return (
    <div className={`${panel} border-l-4 ${bordes} px-5 py-4`}>
      <p className="text-sm text-tierra-600">{titulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valorColor}`}>{valor}</p>
    </div>
  );
}
