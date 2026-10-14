import { prisma } from "@/lib/db";
import { requireUserPagina } from "@/lib/session";
import { Cabecera, NavegacionMovil, TituloPagina } from "@/components/cabecera";
import { NuevoCliente } from "./nuevo-cliente";
import { panel } from "@/lib/ui";

export const metadata = { title: "Clientes — Licitaciones" };
export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const sesion = await requireUserPagina();

  const clientes = await prisma.cliente.findMany({
    include: {
      _count: { select: { licitaciones: true } },
      creadoPor: { select: { nombre: true } },
    },
    orderBy: { nombre: "asc" },
  });

  return (
    <main className="min-h-screen">
      <Cabecera titulo="Clientes" usuario={sesion.nombre} rol={sesion.rol} activa="/clientes" />
      <NavegacionMovil activa="/clientes" />

      <div className="mx-auto max-w-6xl px-6 pb-16">
        <TituloPagina
          titulo="Clientes"
          descripcion={`${clientes.length} clientes · el email es el destinatario real de las propuestas y de los recordatorios`}
        />

        <NuevoCliente />

        <div className={`${panel} mt-4 overflow-x-auto`}>
          <table className="min-w-full text-sm">
            <thead className="bg-tierra-50 text-left text-xs uppercase tracking-wide text-tierra-500">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 text-right font-medium">Licitaciones</th>
                <th className="px-4 py-3 font-medium">Alta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tierra-100">
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-tierra-500">
                    Todavía no hay clientes cargados.
                  </td>
                </tr>
              )}
              {clientes.map((c) => (
                <tr key={c.id} className="hover:bg-tierra-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-azul-900">{c.nombre}</p>
                    {c.razonSocial && c.razonSocial !== c.nombre && (
                      <p className="text-xs text-tierra-500">{c.razonSocial}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-tierra-600">{c.email}</td>
                  <td className="px-4 py-3 text-tierra-500">{c.telefono ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-tierra-600">
                    {c._count.licitaciones}
                  </td>
                  <td className="px-4 py-3 text-tierra-500">
                    <p className="text-xs">{c.creadoEn.toLocaleDateString("es-AR")}</p>
                    <p className="text-xs text-tierra-400">{c.creadoPor?.nombre ?? "—"}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
