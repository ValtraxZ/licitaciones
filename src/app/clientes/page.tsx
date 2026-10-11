import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserPagina } from "@/lib/session";
import { NuevoCliente } from "./nuevo-cliente";

export const metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  await requireUserPagina();

  const clientes = await prisma.cliente.findMany({
    include: {
      _count: { select: { licitaciones: true } },
      creadoPor: { select: { nombre: true } },
    },
    orderBy: { nombre: "asc" },
  });

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-500">
            {clientes.length} clientes · el email es el destinatario de propuestas y recordatorios
          </p>
        </div>
        <Link href="/dashboard" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          Volver al panel
        </Link>
      </header>

      <NuevoCliente />

      <div className="mt-6 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Teléfono</th>
              <th className="px-4 py-3 text-right font-medium">Licitaciones</th>
              <th className="px-4 py-3 font-medium">Alta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clientes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  Todavía no hay clientes cargados.
                </td>
              </tr>
            )}
            {clientes.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{c.nombre}</p>
                  {c.razonSocial && c.razonSocial !== c.nombre && (
                    <p className="text-xs text-slate-400">{c.razonSocial}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{c.email}</td>
                <td className="px-4 py-3 text-slate-500">{c.telefono ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {c._count.licitaciones}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  <p className="text-xs">{c.creadoEn.toLocaleDateString("es-AR")}</p>
                  <p className="text-xs text-slate-400">{c.creadoPor?.nombre ?? "—"}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
