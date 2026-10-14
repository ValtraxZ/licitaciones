import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { calcularSaldo, presupuestoDisponible } from "@/lib/reglas";
import { requireUserPagina } from "@/lib/session";
import { esEditable, transicionesDisponibles } from "@/lib/estados";
import { formatear, tiempoRestante } from "@/lib/dinero";
import { urlFirmada } from "@/lib/storage";
import { obtenerCatalogo } from "@/lib/dashboard";
import { EstadoBadge, OrigenBadge } from "@/components/estado-badge";
import {
  PanelLicitacion,
  BotonQuitar,
  AgregarProducto,
  SubirDocumento,
  RegistrarPago,
} from "./controles";

export const dynamic = "force-dynamic";

/** El título se arma acá porque depende del dato; `params` es una Promise en Next 16. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const licitacion = await prisma.licitacion.findUnique({
    where: { id },
    select: { codigo: true, titulo: true },
  });
  return {
    title: licitacion ? `${licitacion.codigo} — ${licitacion.titulo}` : "Licitación",
  };
}

export default async function DetalleLicitacion({ params }: { params: Promise<{ id: string }> }) {
  await requireUserPagina();
  const { id } = await params;

  const licitacion = await prisma.licitacion.findUnique({
    where: { id },
    include: {
      cliente: true,
      productos: { include: { producto: true }, orderBy: { id: "asc" } },
      pagos: { orderBy: { fechaPago: "desc" }, include: { registradoPor: { select: { nombre: true } } } },
      historial: { orderBy: { createdAt: "desc" } },
      creadoPor: { select: { nombre: true } },
    },
  });

  if (!licitacion) notFound();

  const saldo = calcularSaldo(
    licitacion.montoFacturado,
    licitacion.pagos.map((p) => p.monto),
  );
  const disponible = presupuestoDisponible(licitacion);
  const editable = esEditable(licitacion.estado);
  const ahora = new Date();

  // El bucket es privado: el link se firma en el momento de renderizar la página.
  let documentoUrl: string | null = null;
  if (licitacion.documentoPath) {
    try {
      documentoUrl = await urlFirmada(licitacion.documentoPath, 3600);
    } catch {
      documentoUrl = null;
    }
  }

  const { productos } = await obtenerCatalogo();

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="border-b border-tierra-200 pb-4">
        <Link href="/licitaciones" className="text-sm text-tierra-500 hover:underline">
          ← Licitaciones
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-tierra-400">{licitacion.codigo}</p>
            <h1 className="text-2xl font-semibold tracking-tight text-azul-900">{licitacion.titulo}</h1>
            <p className="mt-1 text-sm text-tierra-500">
              {licitacion.cliente.nombre} · {licitacion.cliente.email}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <EstadoBadge estado={licitacion.estado} />
            {licitacion.estado === "activa" && (
              <span
                className={
                  licitacion.fechaLimite.getTime() - ahora.getTime() < 48 * 3_600_000
                    ? "text-sm font-semibold text-naranja-700"
                    : "text-sm text-tierra-600"
                }
              >
                {tiempoRestante(licitacion.fechaLimite, ahora)}
              </span>
            )}
          </div>
        </div>
      </header>

      <PanelLicitacion
        id={licitacion.id}
        estado={licitacion.estado}
        transiciones={transicionesDisponibles(licitacion.estado)}
        editable={editable}
        totalProductos={licitacion.totalProductos}
        presupuestoMaximo={licitacion.presupuestoMaximo}
        disponible={disponible}
        saldo={saldo}
        montoFacturado={licitacion.montoFacturado}
        fechaLimite={licitacion.fechaLimite.toISOString()}
        restante={tiempoRestante(licitacion.fechaLimite, ahora)}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-6">
          {/* ── PRODUCTOS ── */}
          <div className="rounded-xl bg-white p-5 ring-1 ring-tierra-200">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-azul-900">Productos</h2>
              <span className="text-sm text-tierra-500">
                {licitacion.productos.length} ítems ·{" "}
                <span className="font-medium text-azul-900">
                  {formatear(licitacion.totalProductos)}
                </span>{" "}
                de {formatear(licitacion.presupuestoMaximo)}
              </span>
            </div>

            <BarraPresupuesto usado={licitacion.totalProductos} maximo={licitacion.presupuestoMaximo} />

            {licitacion.productos.length === 0 ? (
              <p className="mt-4 text-sm text-tierra-500">Todavía no hay productos cargados.</p>
            ) : (
              <table className="mt-4 min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-tierra-500">
                  <tr>
                    <th className="py-2 font-medium">Producto</th>
                    <th className="py-2 text-right font-medium">Cant.</th>
                    <th className="py-2 text-right font-medium">Precio unit.</th>
                    <th className="py-2 text-right font-medium">Subtotal</th>
                    {editable && <th className="py-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-tierra-100">
                  {licitacion.productos.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2">
                        <span className="font-medium text-azul-900">{item.producto.nombre}</span>
                        <span className="ml-2 text-xs text-tierra-400">{item.producto.sku}</span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{item.cantidad}</td>
                      <td className="py-2 text-right tabular-nums">{formatear(item.precioUnitario)}</td>
                      <td className="py-2 text-right font-medium tabular-nums text-azul-900">
                        {formatear(item.subtotal)}
                      </td>
                      {editable && (
                        <td className="py-2 text-right">
                          <BotonQuitar licitacionId={licitacion.id} itemId={item.id} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {editable ? (
              <AgregarProducto licitacionId={licitacion.id} productos={productos} />
            ) : (
              <p className="mt-4 rounded-md bg-tierra-50 px-3 py-2 text-sm text-tierra-600 ring-1 ring-tierra-200">
                La licitación está en estado <strong>{licitacion.estado}</strong>: no se pueden agregar
                ni quitar productos.
              </p>
            )}
          </div>

          {/* ── PAGOS ── */}
          <div className="rounded-xl bg-white p-5 ring-1 ring-tierra-200">
            <h2 className="font-semibold text-azul-900">Pagos</h2>
            <dl className="mt-3 grid grid-cols-3 gap-4 text-sm">
              <Dato etiqueta="Facturado" valor={formatear(saldo.facturado)} />
              <Dato etiqueta="Pagado" valor={formatear(saldo.pagado)} />
              <Dato
                etiqueta="Saldo pendiente"
                valor={formatear(saldo.saldo)}
                destacado={saldo.saldo === 0 && saldo.facturado > 0}
              />
            </dl>

            {licitacion.pagos.length > 0 && (
              <table className="mt-4 min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-tierra-500">
                  <tr>
                    <th className="py-2 font-medium">Fecha</th>
                    <th className="py-2 font-medium">Método</th>
                    <th className="py-2 font-medium">Referencia</th>
                    <th className="py-2 text-right font-medium">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tierra-100">
                  {licitacion.pagos.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2">{p.fechaPago.toLocaleDateString("es-AR")}</td>
                      <td className="py-2 capitalize text-tierra-600">{p.metodo}</td>
                      <td className="py-2 text-tierra-500">{p.referencia ?? "—"}</td>
                      <td className="py-2 text-right font-medium tabular-nums text-azul-900">
                        {formatear(p.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {licitacion.estado === "por_cobrar" && (
              <RegistrarPago licitacionId={licitacion.id} saldo={saldo.saldo} />
            )}
          </div>
        </section>

        {/* ── COLUMNA DERECHA ── */}
        <aside className="space-y-6">
          <div className="rounded-xl bg-white p-5 ring-1 ring-tierra-200">
            <h2 className="font-semibold text-azul-900">Documento de propuesta</h2>
            {licitacion.documentoNombre ? (
              <div className="mt-3 space-y-2 text-sm">
                <p className="font-medium text-azul-900">{licitacion.documentoNombre}</p>
                <p className="text-tierra-500">
                  {licitacion.documentoMime} ·{" "}
                  {((licitacion.documentoTamano ?? 0) / 1024).toFixed(0)} KB
                </p>
                {documentoUrl ? (
                  <a
                    href={documentoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-sm font-medium text-azul-800 underline"
                  >
                    Abrir documento ↗
                  </a>
                ) : (
                  <p className="text-sm text-naranja-700">No se pudo generar el link.</p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-tierra-500">Sin documento adjunto.</p>
            )}

            {editable && <SubirDocumento licitacionId={licitacion.id} />}
          </div>

          <div className="rounded-xl bg-white p-5 ring-1 ring-tierra-200">
            <h2 className="font-semibold text-azul-900">Datos</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Fila etiqueta="Fecha límite" valor={licitacion.fechaLimite.toLocaleString("es-AR")} />
              <Fila etiqueta="Creada" valor={licitacion.creadoEn.toLocaleString("es-AR")} />
              {licitacion.enviadaEn && (
                <Fila etiqueta="Enviada" valor={licitacion.enviadaEn.toLocaleString("es-AR")} />
              )}
              {licitacion.recordatorioEnviadoEn && (
                <Fila
                  etiqueta="Recordatorio"
                  valor={licitacion.recordatorioEnviadoEn.toLocaleString("es-AR")}
                />
              )}
              <Fila etiqueta="Creada por" valor={licitacion.creadoPor?.nombre ?? "—"} />
            </dl>
            {licitacion.descripcion && (
              <p className="mt-3 whitespace-pre-line text-sm text-tierra-600">
                {licitacion.descripcion}
              </p>
            )}
          </div>

          {/* ── HISTORIAL ── */}
          <div className="rounded-xl bg-white p-5 ring-1 ring-tierra-200">
            <h2 className="font-semibold text-azul-900">Historial de transiciones</h2>
            {licitacion.historial.length === 0 ? (
              <p className="mt-2 text-sm text-tierra-500">
                Sin transiciones todavía (la licitación está en borrador).
              </p>
            ) : (
              <ol className="mt-3 space-y-3 border-l border-tierra-200 pl-4">
                {licitacion.historial.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-tierra-300 ring-4 ring-white" />
                    <p className="text-sm font-medium text-azul-900">
                      {h.estadoAnterior} → {h.estadoNuevo}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-tierra-500">
                      <OrigenBadge origen={h.origen} />
                      <span>{new Date(h.createdAt).toLocaleString("es-AR")}</span>
                      {h.usuarioEmail && <span>· {h.usuarioEmail}</span>}
                    </div>
                    {h.comentario && <p className="mt-1 text-xs text-tierra-500">{h.comentario}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function BarraPresupuesto({ usado, maximo }: { usado: number; maximo: number }) {
  const pct = maximo > 0 ? Math.min(100, Math.round((usado / maximo) * 100)) : 0;
  const tono = pct >= 90 ? "bg-naranja-500" : pct >= 70 ? "bg-naranja-500" : "bg-azul-500";
  return (
    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-tierra-100">
      <div className={`h-full rounded-full ${tono}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Dato({ etiqueta, valor, destacado }: { etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-tierra-500">{etiqueta}</dt>
      <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${destacado ? "text-azul-700" : "text-azul-900"}`}>
        {valor}
      </dd>
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-tierra-500">{etiqueta}</dt>
      <dd className="text-right font-medium text-azul-900">{valor}</dd>
    </div>
  );
}
