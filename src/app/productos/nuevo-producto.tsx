"use client";

import { useState } from "react";
import { api, useAccion } from "@/lib/client";
import { alertaError, btnPrimario, btnSecundario, input, panel } from "@/lib/ui";

/**
 * Alta de producto.
 *
 * El precio se captura en pesos y se convierte a centavos enteros antes de enviar,
 * porque la API rechaza floats con 422 (`.int()` del schema de Zod). Mostrar el error
 * del servidor tal cual evita mantener dos mensajes distintos para el mismo problema.
 */
export function NuevoProducto() {
  const [abierto, setAbierto] = useState(false);

  const crear = async (formData: FormData) => {
    await api("/api/productos", {
      metodo: "POST",
      cuerpo: {
        sku: formData.get("sku"),
        nombre: formData.get("nombre"),
        descripcion: formData.get("descripcion") || undefined,
        precioUnitario: aCentavos(String(formData.get("precio") ?? "")),
      },
    });
    setAbierto(false);
  };

  const { ejecutar, cargando, error } = useAccion(crear);

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="mt-6 rounded-md bg-azul-700 px-4 py-2 text-sm font-medium text-white hover:bg-azul-800"
      >
        Nuevo producto
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void ejecutar(new FormData(e.currentTarget));
      }}
      className="mt-6 grid gap-4 rounded-xl bg-white p-5 ring-1  sm:grid-cols-2"
    >
      <h2 className="font-semibold text-azul-900 sm:col-span-2">Nuevo producto</h2>

      <div>
        <label className="block text-sm font-medium text-tierra-700">SKU</label>
        <input
          name="sku"
          placeholder="SRV-001"
          required
          className="mt-1 w-full rounded-md border border-tierra-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-tierra-700">Precio unitario (ARS)</label>
        <input
          name="precio"
          placeholder="2.500,00"
          inputMode="decimal"
          required
          className="mt-1 w-full rounded-md border border-tierra-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-tierra-700">Nombre</label>
        <input
          name="nombre"
          placeholder="Servicio de consultoría en licitaciones"
          required
          className="mt-1 w-full rounded-md border border-tierra-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-tierra-700">Descripción</label>
        <textarea
          name="descripcion"
          rows={2}
          className="mt-1 w-full rounded-md border border-tierra-300 px-3 py-2 text-sm"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-naranja-50 px-3 py-2 text-sm text-naranja-800 ring-1 ring-naranja-300 sm:col-span-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={cargando}
          className="rounded-md bg-azul-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {cargando ? "Creando…" : "Crear producto"}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-md border border-tierra-300 px-4 py-2 text-sm"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function aCentavos(entrada: string): number {
  const limpio = entrada.replace(/[^\d,-]/g, "").replace(",", ".");
  const valor = Number(limpio);
  if (Number.isNaN(valor)) return 0;
  return Math.round(valor * 100);
}
