import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserPagina } from "@/lib/session";
import { formatear, tiempoRestante } from "@/lib/dinero";
import { obtenerCatalogo } from "@/lib/dashboard";
import { EstadoBadge } from "@/components/estado-badge";
import { NuevaLicitacion } from "./nueva-licitacion";
import type { EstadoLicitacion } from "@prisma/client";

export const metadata = { title: "Licitaciones" };
export const dynamic = "force-dynamic";

const ESTADOS_FILTRO: EstadoLicitacion[] = [
  "borrador", "activa", "finalizada", "por_cobrar", "cobrada", "perdida",
];

export default async function LicitacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string }>;
}) {
  await requireUserPagina();
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

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Licitaciones</h1>
          <p className="text-sm text-slate-500">{licitaciones.length} en el listado</p>
        </div>
        <Link href="/" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          Volver al panel
        </Link>
      </header>

      <NuevaLicitacion clientes={clientes} />

      <nav className="mt-6 flex flex-wrap gap-2 text-sm">
        <FiltroChip activo={!params.estado} href="/licitaciones">
          Todas
        </FiltroChip>
        {ESTADOS_FILTRO.map((e) => (
          <FiltroChip key={e} activo={params.estado === e} href={`/licitaciones?estado=${e}`}>
            {e.replace("_", " ")}
          </FiltroChip>
        ))}
      </nav>

      <div className="mt-4 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Licitación</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Total / Presupuesto</th>
              <th className="px-4 py-3 font-medium">Vence</th>
              <th className="px-4 py-3 text-right font-medium">Items</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {licitaciones.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  No hay licitaciones que coincidan con el filtro.
                </td>
              </tr>
            )}
            {licitaciones.map((l) => {
              const restante = tiempoRestante(l.fechaLimite, ahora);
              const urgente = l.estado === "activa" && l.fechaLimite.getTime() - ahora.getTime() < 48 * 3_600_000;
              return (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/licitaciones/${l.id}`} className="font-medium text-slate-900 hover:underline">
                      {l.titulo}
                    </Link>
                    <p className="text-xs text-slate-400">{l.codigo}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{l.cliente.nombre}</td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={l.estado} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className="font-medium text-slate-900">{formatear(l.totalProductos)}</span>
                    <p className="text-xs text-slate-400">de {formatear(l.presupuestoMaximo)}</p>
                  </td>
                  <td className="px-4 py-3">
                    {l.estado === "activa" ? (
                      <span className={urgente ? "font-medium text-red-600" : "text-slate-600"}>
                        {restante}
                      </span>
                    ) : (
                      <span className="text-slate-400">{l.fechaLimite.toLocaleDateString("es-AR")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {l._count.productos}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
      className={`rounded-full px-3 py-1 ring-1 ${
        activo ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </Link>
  );
}
