import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserPagina } from "@/lib/session";
import { formatear } from "@/lib/dinero";
import { NuevoProducto } from "./nuevo-producto";

export const metadata = { title: "Productos" };
export const dynamic = "force-dynamic";

export default async function ProductosPage() {
  await requireUserPagina();

  const productos = await prisma.producto.findMany({
    include: { _count: { select: { licitaciones: true } } },
    orderBy: { nombre: "asc" },
  });

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Productos</h1>
          <p className="text-sm text-slate-500">{productos.length} productos en el catálogo</p>
        </div>
        <Link href="/dashboard" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          Volver al panel
        </Link>
      </header>

      <NuevoProducto />

      <div className="mt-6 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 text-right font-medium">Precio unitario</th>
              <th className="px-4 py-3 text-right font-medium">Usado en</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {productos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  Todavía no hay productos cargados.
                </td>
              </tr>
            )}
            {productos.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.sku}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{p.nombre}</p>
                  {p.descripcion && <p className="text-xs text-slate-500">{p.descripcion}</p>}
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                  {formatear(p.precioUnitario)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {p._count.licitaciones}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      p.activo
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-slate-100 text-slate-500 ring-slate-200"
                    }`}
                  >
                    {p.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
