"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { alertaError, btnPrimario, input } from "@/lib/ui";

/**
 * Formulario de login (Client Component).
 *
 * Por qué es cliente: necesita estado del formulario y disparar navegación.
 * Por qué NO valida nada del lado del cliente: la validación real es el `LoginSchema`
 * de Zod que corre en el route handler. Duplicarla acá solo produce dos mensajes
 * distintos para el mismo error, y el que ve el usuario es el del servidor.
 *
 * Lo que sí muestra es el mensaje que YA viene formateado desde la API
 * (`{ error: { code, message } }`). Así el texto no se escribe dos veces.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const destino = params.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const cuerpo = await res.json();

      if (!res.ok) {
        setError(cuerpo?.error?.message ?? "No se pudo iniciar sesión");
        return;
      }

      // La cookie quedó seteada por el route handler. `refresh()` revalida los Server
      // Components para que el proxy/protector vea la sesión nueva; sin esto, el
      // primer render following the redirect puede seguir viendo el estado viejo.
      router.refresh();
      router.push(destino);
    } catch {
      setError("Error de conexión. Revisá que el servidor esté corriendo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm ring-1 ring-tierra-200">
      <h1 className="text-xl font-semibold text-azul-900">Sistema de Licitaciones</h1>
      <p className="mt-1 text-sm text-tierra-500">Ingresá con tu cuenta</p>

      <form onSubmit={enviar} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-tierra-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-tierra-300 px-3 py-2 text-sm outline-none focus:border-azul-500 focus:ring-2 focus:ring-tierra-200"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-tierra-700">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-tierra-300 px-3 py-2 text-sm outline-none focus:border-azul-500 focus:ring-2 focus:ring-tierra-200"
          />
        </div>

        {error && (
          <p role="alert" className={alertaError}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-md bg-azul-700 px-4 py-2 text-sm font-medium text-white hover:bg-azul-800 disabled:opacity-50"
        >
          {enviando ? "Ingresando…" : "Ingresar"}
        </button>
      </form>

      <div className="mt-6 rounded-md border border-tierra-200 bg-tierra-50 p-3 text-xs text-tierra-600">
        <p className="font-medium">Cuentas de prueba (seed)</p>
        <p className="mt-1">admin@demo.com / Admin123!</p>
        <p>user@demo.com / User123!</p>
      </div>
    </div>
  );
}
