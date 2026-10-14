import Link from "next/link";
import type { EstadoLicitacion } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUserPagina } from "@/lib/session";
import { formatear, tiempoRestante } from "@/lib/dinero";
import { obtenerCatalogo } from "@/lib/dashboard";
import { EstadoBadge } from "@/components/estado-badge";
import { Cabecera, NavegacionMovil, TituloPagina } from "@/components/cabecera";
import { NuevaLicitacion } from "./nueva-licitacion";
import { panel } from "@/lib/ui";

export const metadata = { title: "Licitaciones — Licitaciones" };
export const dynamic = "force-dynamic";

const ESTADOS_FILTRO: EstadoLicitacion[] = [
  "borrador", "activa", "finalizada", "por_cobrar", "cobrada", "perdida",
];

export default async function LicitacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string }>;
}) {
  const sesion = await requireUserPagina();
  const params = await searchParams;

  const where = {
    ...(params.estado && ESTADOS_FILTRO.includes(params.estado as EstadoLicitacion)
      ? { estado: params.estado as EstadoLicitacion }
      : {}),
    ...(params.q
      ? {
          OR: [
            { titulo: { contains: params.q, mode: "insensitive" as const } },
            { codigo: { contains: params.q, mode: "insensitive" as const } },
            { cliente: { nombre: { contains: params.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [licitaciones, { clientes }] = await Promise.all([
    prisma.licitacion.findMany({
      where,
      include: {
        cliente: { select: { nombre: true } },
        _count: { select: { productos: true, pagos: true } },
      },
      // Ordenar por fecha límite: lo más urgente primero. Es la pregunta que se hace
      // quien abre esta pantalla.
      orderBy: [{ fechaLimite: "asc" }, { creadoEn: "desc" }],
    }),
    obtenerCatalogo(),
  ]);

  const ahora = new Date();
  const enFiltro = Boolean(params.estado || params.q);

  return (
    <main className="min-h-screen">
      <Cabecera
        titulo="Licitaciones"
        usuario={sesion.nombre}
        rol={sesion.rol}
        activa="/licitaciones"
      />
      <NavegacionMovil activa="/licitaciones" />

      <div className="mx-auto max-w-6xl px-6 pb-16">
        <TituloPagina
          titulo="Licitaciones"
          descripcion={`${licitaciones.length} en el listado${
            enFiltro ? " · filtrado" : ""
          } · el total nunca puede superar el presupuesto máximo`}
        />

        <NuevaLicitacion clientes={clientes} />

        <nav className="mt-5 flex flex-wrap gap-2 text-sm">
          <FiltroChip activo={!params.estado} href="/licitaciones">
            Todas
          </FiltroChip>
          {ESTADOS_FILTRO.map((e) => (
            <FiltroChip key={e} activo={params.estado === e} href={`/licitaciones?estado=${e}`}>
              {e.replace("_", " ")}
            </FiltroChip>
          ))}
        </nav>

        <div className={`${panel} mt-4 overflow-x-auto`}>
          <table className="min-w-full text-sm">
            <thead className="bg-tierra-50 text-left text-xs uppercase tracking-wide text-tierra-500">
              <tr>
                <th className="px-4 py-3 font-medium">Licitación</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Total / Presupuesto</th>
                <th className="px-4 py-3 font-medium">Vence</th>
                <th className="px-4 py-3 text-right font-medium">Items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tierra-100">
              {licitaciones.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-tierra-500">
                    No hay licitaciones que coincidan con el filtro.
                  </td>
                </tr>
              )}
              {licitaciones.map((l) => {
                const restante = tiempoRestante(l.fechaLimite, ahora);
                const urgente =
                  l.estado === "activa" && l.fechaLimite.getTime() - ahora.getTime() < 48 * 3_600_000;
                return (
                  <tr key={l.id} className="hover:bg-tierra-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/licitaciones/${l.id}`}
                        className="font-medium text-azul-800 hover:underline"
                      >
                        {l.titulo}
                      </Link>
                      <p className="text-xs text-tierra-400">{l.codigo}</p>
                    </td>
                    <td className="px-4 py-3 text-tierra-600">{l.cliente.nombre}</td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={l.estado} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="font-medium text-tierra-900">{formatear(l.totalProductos)}</span>
                      <p className="text-xs text-tierra-400">de {formatear(l.presupuestoMaximo)}</p>
                    </td>
                    <td className="px-4 py-3">
                      {l.estado === "activa" ? (
                        <span className={urgente ? "font-medium text-naranja-700" : "text-tierra-600"}>
                          {restante}
                        </span>
                      ) : (
                        <span className="text-tierra-400">
                          {l.fechaLimite.toLocaleDateString("es-AR")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-tierra-600">
                      {l._count.productos}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function FiltroChip({
  activo,
  href,
  children,
}: {
  activo: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={
        activo
          ? "rounded-full bg-azul-700 px-3 py-1 font-medium text-white ring-1 ring-azul-700"
          : "rounded-full bg-white px-3 py-1 text-tierra-600 ring-1 ring-tierra-300 transition-colors hover:bg-tierra-100"
      }
    >
      {children}
    </Link>
  );
}
