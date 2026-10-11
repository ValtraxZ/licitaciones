"use client";

import { useState } from "react";
import { api, useAccion } from "@/lib/client";

type Cliente = { id: string; nombre: string; email: string };

/**
 * Formulario de alta de licitación en borrador.
 *
 * Montos: la API espera CENTAVOS enteros. Acá el usuario escribe pesos ("12.500,50")
 * y se convierte con `aCentavos()` al enviar. La conversión vive en el submit, no en un
 * `onChange` que rearme el estado en cada tecla.
 */
export function NuevaLicitacion({ clientes }: { clientes: Cliente[] }) {
  const [abierto, setAbierto] = useState(false);

  const crear = async (formData: FormData) => {
    await api("/api/licitaciones", {
      metodo: "POST",
      cuerpo: {
        titulo: formData.get("titulo"),
        clienteId: formData.get("clienteId"),
        presupuestoMaximo: aCentavos(String(formData.get("presupuesto") ?? "")),
        fechaLimite: new Date(String(formData.get("fechaLimite"))).toISOString(),
        descripcion: formData.get("descripcion") || undefined,
      },
    });
    setAbierto(false);
  };

  const { ejecutar, cargando, error } = useAccion(crear);

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="mt-6 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Nueva licitación
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void ejecutar(new FormData(e.currentTarget));
      }}
      className="mt-6 space-y-4 rounded-xl bg-white p-5 ring-1 ring-slate-200"
    >
      <h2 className="font-semibold text-slate-900">Nueva licitación (borrador)</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Título" nombre="titulo" placeholder="Licitación de servicios 2026" required />
        <div>
          <label className="block text-sm font-medium text-slate-700">Cliente</label>
          <select
            name="clienteId"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Elegir cliente…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.email})
              </option>
            ))}
          </select>
        </div>
        <Campo
          etiqueta="Presupuesto máximo (ARS)"
          nombre="presupuesto"
          placeholder="20.000,00"
          inputMode="decimal"
          required
        />
        <div>
          <label className="block text-sm font-medium text-slate-700">Fecha límite</label>
          <input
            type="datetime-local"
            name="fechaLimite"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Descripción</label>
        <textarea
          name="descripcion"
          rows={2}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={cargando}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {cargando ? "Creando…" : "Crear borrador"}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Campo({
  etiqueta,
  nombre,
  placeholder,
  required,
  inputMode,
}: {
  etiqueta: string;
  nombre: string;
  placeholder?: string;
  required?: boolean;
  inputMode?: "decimal" | "text";
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{etiqueta}</label>
      <input
        name={nombre}
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

/**
 * Convierte lo que escribe el usuario a centavos enteros.
 *
 * Acepta "12.500,50" (formato local) y "12500.50". Se hace `Math.round(valor * 100)`
 * para que quede SIEMPRE un entero: la base rechaza floats y el error sería confuso.
 */
function aCentavos(entrada: string): number {
  const limpio = entrada.replace(/[^\d,-]/g, "").replace(",", ".");
  const valor = Number(limpio);
  if (Number.isNaN(valor)) return 0;
  return Math.round(valor * 100);
}
