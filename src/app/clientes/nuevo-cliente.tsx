"use client";

import { useState } from "react";
import { api, useAccion } from "@/lib/client";

/** Alta de cliente. Reutiliza el endpoint POST /api/clientes ya verificado. */
export function NuevoCliente() {
  const [abierto, setAbierto] = useState(false);

  const crear = async (formData: FormData) => {
    await api("/api/clientes", {
      metodo: "POST",
      cuerpo: {
        nombre: formData.get("nombre"),
        email: formData.get("email"),
        razonSocial: formData.get("razonSocial") || undefined,
        telefono: formData.get("telefono") || undefined,
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
        Nuevo cliente
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void ejecutar(new FormData(e.currentTarget));
        setAbierto(false);
      }}
      className="mt-6 grid gap-4 rounded-xl bg-white p-5 ring-1 ring-slate-200 sm:grid-cols-2"
    >
      <h2 className="font-semibold text-slate-900 sm:col-span-2">Nuevo cliente</h2>

      <Campo etiqueta="Nombre" nombre="nombre" placeholder="Constructora del Sur S.R.L." required />
      <Campo
        etiqueta="Email (destinatario de las propuestas)"
        nombre="email"
        type="email"
        placeholder="compras@empresa.com"
        required
      />
      <Campo etiqueta="Razón social" nombre="razonSocial" />
      <Campo etiqueta="Teléfono" nombre="telefono" />

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 sm:col-span-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={cargando}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {cargando ? "Creando…" : "Crear cliente"}
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
  type = "text",
  placeholder,
  required,
}: {
  etiqueta: string;
  nombre: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{etiqueta}</label>
      <input
        name={nombre}
        type={type}
        placeholder={placeholder}
        required={required}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
