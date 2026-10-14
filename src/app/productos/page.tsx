import { prisma } from "@/lib/db";
import { requireUserPagina } from "@/lib/session";
import { formatear } from "@/lib/dinero";
import { Cabecera, NavegacionMovil, TituloPagina } from "@/components/cabecera";
import { NuevoProducto } from "./nuevo-producto";
import { panel } from "@/lib/ui";

export const metadata = { title: "Productos — Licitaciones" };
export const dynamic = "force-dynamic";

export default async function ProductosPage() {
  const sesion = await requireUserPagina();

  const productos = await prisma.producto.findMany({
    include: { _count: { select: { licitaciones: true } } },
    orderBy: { nombre: "asc" },
  });

  return (
    <main className="min-h-screen">
      <Cabecera titulo="Productos" usuario={sesion.nombre} rol={sesion.rol} activa="/productos" />
      <NavegacionMovil activa="/productos" />

      <div className="mx-auto max-w-6xl px-6 pb-16">
        <TituloPagina
          titulo="Productos"
          descripcion={`${productos.length} productos en el catálogo · el precio unitario se congela al agregarlo a una licitación`}
        />

        <NuevoProducto />

        <div className={`${panel} mt-4 overflow-x-auto`}>
          <table className="min-w-full text-sm">
            <thead className="bg-tierra-50 text-left text-xs uppercase tracking-wide text-tierra-500">
              <tr>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 text-right font-medium">Precio unitario</th>
                <th className="px-4 py-3 text-right font-medium">Usado en</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tierra-100">
              {productos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-tierra-500">
                    Todavía no hay productos cargados.
                  </td>
                </tr>
              )}
              {productos.map((p) => (
                <tr key={p.id} className="hover:bg-tierra-50">
                  <td className="px-4 py-3 font-mono text-xs text-tierra-500">{p.sku}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-azul-900">{p.nombre}</p>
                    {p.descripcion && <p className="text-xs text-tierra-500">{p.descripcion}</p>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-tierra-900">
                    {formatear(p.precioUnitario)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-tierra-600">
                    {p._count.licitaciones}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        p.activo
                          ? "rounded-full bg-azul-100 px-2 py-0.5 text-xs font-medium text-azul-800 ring-1 ring-inset ring-azul-300"
                          : "rounded-full bg-tierra-100 px-2 py-0.5 text-xs font-medium text-tierra-600 ring-1 ring-inset ring-tierra-300"
                      }
                    >
                      {p.activo ? "Activo" : "Inactivo"}
                    </span>
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
