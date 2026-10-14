"use client";

import { useState } from "react";
import { api, useAccion } from "@/lib/client";
import { alertaError, btnPrimario, btnSecundario, input, panel } from "@/lib/ui";

/**
 * Alta de usuario. Solo accesible desde la página de usuarios, que ya exige rol ADMIN.
 *
 * La contraseña viaja al servidor y se hashea con bcrypt allá: el cliente nunca guarda
 * ni calcula el hash, y la API tampoco devuelve el `passwordHash` en la respuesta.
 */
export function NuevoUsuario() {
  const [abierto, setAbierto] = useState(false);

  const crear = async (formData: FormData) => {
    await api("/api/usuarios", {
      metodo: "POST",
      cuerpo: {
        email: formData.get("email"),
        nombre: formData.get("nombre"),
        password: formData.get("password"),
        rol: formData.get("rol"),
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
        Nuevo usuario
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
      <h2 className="font-semibold text-azul-900 sm:col-span-2">Nuevo usuario</h2>

      <div>
        <label className="block text-sm font-medium text-tierra-700">Nombre</label>
        <input
          name="nombre"
          required
          className="mt-1 w-full rounded-md border border-tierra-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-tierra-700">Email</label>
        <input
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded-md border border-tierra-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-tierra-700">Contraseña</label>
        <input
          name="password"
          type="password"
          minLength={8}
          required
          className="mt-1 w-full rounded-md border border-tierra-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-tierra-500">Mínimo 8 caracteres.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-tierra-700">Rol</label>
        <select
          name="rol"
          className="mt-1 w-full rounded-md border border-tierra-300 px-3 py-2 text-sm"
        >
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
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
          {cargando ? "Creando…" : "Crear usuario"}
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
