"use client";

import { useState } from "react";
import { api, useAccion } from "@/lib/client";

type Estado = "borrador" | "activa" | "finalizada" | "por_cobrar" | "cobrada" | "perdida";

// ═════════════════════════════ PANEL DE ACCIONES ═════════════════════════════

const ETIQUETA_ACCION: Record<Estado, { texto: string; estilo: string }> = {
  activa: { texto: "Enviar al cliente", estilo: "bg-blue-600 hover:bg-blue-700 text-white" },
  finalizada: { texto: "Marcar finalizada", estilo: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  perdida: { texto: "Marcar perdida", estilo: "bg-white hover:bg-slate-50 text-slate-700 ring-1 ring-slate-300" },
  por_cobrar: { texto: "Facturar", estilo: "bg-amber-500 hover:bg-amber-600 text-white" },
  borrador: { texto: "", estilo: "" },
  cobrada: { texto: "", estilo: "" },
};

type Saldo = { facturado: number; pagado: number; saldo: number; saldado: boolean };

export function PanelLicitacion({
  id,
  estado,
  transiciones,
  editable,
  totalProductos,
  presupuestoMaximo,
  disponible,
  saldo,
  montoFacturado,
  fechaLimite,
  restante,
}: {
  id: string;
  estado: Estado;
  transiciones: Estado[];
  editable: boolean;
  totalProductos: number;
  presupuestoMaximo: number;
  disponible: number;
  saldo: Saldo;
  montoFacturado: number;
  fechaLimite: string;
  restante: string;
}) {
  const [montoFacturacion, setMontoFacturacion] = useState(
    (montoFacturado || totalProductos).toString(),
  );
  const [facturarAbierto, setFacturarAbierto] = useState(false);

  // Los botones se generan desde `transiciones` que devuelve el BACKEND, no desde una
  // tabla reimplementada en el cliente. Si el backend dice que no se puede, el botón
  // no existe: la UI no puede mostrar una acción que va a ser rechazada con 422.
  //
  // `cobrada` se filtra aparte: la transición por_cobrar → cobrada es AUTOMÁTICA cuando
  // el saldo llega a cero. Ofrecerla como botón rompería el modelo de negocio.
  const manuales = transiciones.filter((t) => t !== "cobrada");

  const enviar = async () => {
    await api(`/api/licitaciones/${id}/enviar`, { metodo: "POST" });
  };
  const resolver = async (resultado: "finalizada" | "perdida") => {
    await api(`/api/licitaciones/${id}/resolver`, { metodo: "POST", cuerpo: { resultado } });
  };
  const facturar = async () => {
    await api(`/api/licitaciones/${id}/facturar`, {
      metodo: "POST",
      cuerpo: { montoFacturado: aCentavos(montoFacturacion) },
    });
    setFacturarAbierto(false);
  };

  const accionEnviar = useAccion(enviar);
  const accionFinalizar = useAccion(() => resolver("finalizada"));
  const accionPerder = useAccion(() => resolver("perdida"));
  const accionFacturar = useAccion(facturar);

  const error = accionEnviar.error ?? accionFinalizar.error ?? accionPerder.error ?? accionFacturar.error;
  const algunaCargando =
    accionEnviar.cargando || accionFinalizar.cargando || accionPerder.cargando || accionFacturar.cargando;

  return (
    <section className="mt-5 rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <dl className="flex flex-wrap gap-6 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Total productos</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
              {formatear(totalProductos)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Presupuesto disponible</dt>
            <dd
              className={`mt-0.5 text-lg font-semibold tabular-nums ${
                disponible === 0 ? "text-amber-600" : "text-slate-900"
              }`}
            >
              {formatear(disponible)}
            </dd>
          </div>
          {saldo.facturado > 0 && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Saldo pendiente</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                {formatear(saldo.saldo)}
              </dd>
            </div>
          )}
          {estado === "activa" && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Vence en</dt>
              <dd className="mt-0.5 text-lg font-semibold text-slate-900">{restante}</dd>
            </div>
          )}
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          {manuales.map((destino) => {
            const cfg = ETIQUETA_ACCION[destino];
            const cargando =
              (destino === "activa" && accionEnviar.cargando) ||
              (destino === "finalizada" && accionFinalizar.cargando) ||
              (destino === "perdida" && accionPerder.cargando);
            return (
              <button
                key={destino}
                onClick={() => {
                  if (destino === "activa") void accionEnviar.ejecutar();
                  if (destino === "finalizada") void accionFinalizar.ejecutar();
                  if (destino === "perdida") void accionPerder.ejecutar();
                  if (destino === "por_cobrar") setFacturarAbierto((v) => !v);
                }}
                disabled={algunaCargando}
                className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${cfg.estilo}`}
              >
                {cargando ? "…" : destino === "por_cobrar" ? cfg.texto : cfg.texto}
              </button>
            );
          })}

          {manuales.length === 0 && (
            <p className="text-sm text-slate-500">
              {estado === "cobrada" && "Licitación cobrada: no admite más movimientos."}
              {estado === "perdida" && "Licitación perdida: estado terminal."}
              {estado === "borrador" && "Subí el documento de propuesta para poder enviarla."}
            </p>
          )}
        </div>
      </div>

      {/* Facturación a medida: el monto por defecto es el total de productos, pero se
          puede facturar menos si hubo negociación (por eso `montoFacturado` es un campo
          aparte en el modelo y no siempre igual a `totalProductos`). */}
      {facturarAbierto && (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200">
          <div>
            <label className="block text-xs font-medium text-amber-900">
              Monto a facturar (ARS)
            </label>
            <input
              value={montoFacturacion}
              onChange={(e) => setMontoFacturacion(e.target.value)}
              inputMode="decimal"
              className="mt-1 rounded-md border border-amber-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={() => void accionFacturar.ejecutar()}
            disabled={accionFacturar.cargando}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Confirmar facturación
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
    </section>
  );
}

// ═════════════════════════════ PRODUCTOS ═════════════════════════════

export function AgregarProducto({
  licitacionId,
  productos,
}: {
  licitacionId: string;
  productos: { id: string; sku: string; nombre: string; precioUnitario: number }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [productoId, setProductoId] = useState(productos[0]?.id ?? "");
  const [cantidad, setCantidad] = useState("1");
  const [precio, setPrecio] = useState(
    String((productos[0]?.precioUnitario ?? 0) / 100),
  );

  const agregar = async () => {
    await api(`/api/licitaciones/${licitacionId}/productos`, {
      metodo: "POST",
      cuerpo: {
        productoId,
        cantidad: Number(cantidad),
        precioUnitario: aCentavos(precio),
      },
    });
    setAbierto(false);
  };

  const { ejecutar, cargando, error } = useAccion(agregar);

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="mt-4 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
      >
        + Agregar producto
      </button>
    );
  }

  const seleccionado = productos.find((p) => p.id === productoId);

  return (
    <div className="mt-4 space-y-3 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600">Producto</label>
          <select
            value={productoId}
            onChange={(e) => {
              setProductoId(e.target.value);
              const p = productos.find((x) => x.id === e.target.value);
              if (p) setPrecio(String(p.precioUnitario / 100));
            }}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} ({p.sku})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Cantidad</label>
          <input
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            type="number"
            min={1}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Precio unit. (ARS)</label>
          <input
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {seleccionado && Number(cantidad) > 0 && (
        <p className="text-sm text-slate-600">
          Subtotal:{" "}
          <strong className="tabular-nums">
            {formatear(Number(cantidad) * aCentavos(precio))}
          </strong>
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => void ejecutar()}
          disabled={cargando}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {cargando ? "Agregando…" : "Agregar"}
        </button>
        <button
          onClick={() => setAbierto(false)}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function BotonQuitar({ licitacionId, itemId }: { licitacionId: string; itemId: string }) {
  const quitar = async () => {
    await api(`/api/licitaciones/${licitacionId}/productos/${itemId}`, { metodo: "DELETE" });
  };
  const { ejecutar, cargando } = useAccion(quitar);

  return (
    <button
      onClick={() => void ejecutar()}
      disabled={cargando}
      className="text-sm text-red-600 hover:underline disabled:opacity-50"
      aria-label="Quitar producto"
    >
      Quitar
    </button>
  );
}

// ═════════════════════════════ DOCUMENTO ═════════════════════════════

export function SubirDocumento({ licitacionId }: { licitacionId: string }) {
  const subir = async (formData: FormData) => {
    // FormData sin Content-Type manual: el browser agrega el boundary multipart.
    await api(`/api/licitaciones/${licitacionId}/documento`, {
      metodo: "POST",
      cuerpo: formData,
    });
  };

  const { ejecutar, cargando, error } = useAccion(subir);

  const generar = async () => {
    await api(`/api/licitaciones/${licitacionId}/documento/generar`, { metodo: "POST" });
  };
  const accionGenerar = useAccion(generar);
  const errorGenerar = accionGenerar.error ?? error;

  return (
    <div className="mt-4 space-y-4">
      {/*
        Generar el PDF desde los productos cargados es el camino recomendado: el documento
        se arma con los MISMOS datos que muestra el detalle, así que no puede desincronizarse.
        Subir un PDF a mano queda para cuando el documento ya viene firmado de otra forma.
      */}
      <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
        <button
          type="button"
          onClick={() => void accionGenerar.ejecutar()}
          disabled={accionGenerar.cargando}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {accionGenerar.cargando ? "Generando…" : "Generar propuesta en PDF"}
        </button>
        <p className="mt-1.5 text-xs text-slate-500">
          Crea el documento con los productos cotizados, el total y el plazo, y lo adjunta.
        </p>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-slate-600">O subir un archivo propio</p>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ejecutar(new FormData(e.currentTarget));
          }}
        >
          <input
            type="file"
            name="archivo"
            accept=".pdf,.doc,.docx"
            required
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          />
          <button
            type="submit"
            disabled={cargando}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {cargando ? "Subiendo…" : "Subir documento"}
          </button>
        </form>
      </div>

      {errorGenerar && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {errorGenerar}
        </p>
      )}
    </div>
  );
}

// ═════════════════════════════ PAGOS ═════════════════════════════

export function RegistrarPago({ licitacionId, saldo }: { licitacionId: string; saldo: number }) {
  const [monto, setMonto] = useState((saldo / 100).toString());
  const [metodo, setMetodo] = useState("transferencia");
  const [referencia, setReferencia] = useState("");

  const pagar = async () => {
    await api(`/api/licitaciones/${licitacionId}/pagos`, {
      metodo: "POST",
      cuerpo: {
        monto: aCentavos(monto),
        metodo,
        referencia: referencia || undefined,
      },
    });
  };

  const { ejecutar, cargando, error } = useAccion(pagar);

  return (
    <form
      className="mt-4 space-y-3 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200"
      onSubmit={(e) => {
        e.preventDefault();
        void ejecutar();
      }}
    >
      <p className="text-sm font-medium text-slate-700">
        Registrar pago — saldo pendiente {formatear(saldo)}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-slate-600">Monto (ARS)</label>
          <input
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="decimal"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Método</label>
          <select
            value={metodo}
            onChange={(e) => setMetodo(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Referencia</label>
          <input
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Nº de comprobante"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={cargando}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {cargando ? "Registrando…" : "Registrar pago"}
      </button>
      <p className="text-xs text-slate-500">
        Si el pago cubre el saldo completo, la licitación pasa a <strong>cobrada</strong> sola.
      </p>
    </form>
  );
}

// ── utilidades ──

/** Pesos escritos por el usuario → centavos enteros. */
function aCentavos(entrada: string): number {
  const limpio = entrada.replace(/[^\d,-]/g, "").replace(",", ".");
  const valor = Number(limpio);
  if (Number.isNaN(valor)) return 0;
  return Math.round(valor * 100);
}

function formatear(centavos: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    centavos / 100,
  );
}
