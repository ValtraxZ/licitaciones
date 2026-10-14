"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { alertaError, btnPrimario, input } from "@/lib/ui";

/**
 * Formulario de login (Client Component).
 *
 * POR QUÉ NO VALIDA NADA DEL LADO DEL CLIENTE
 * ------------------------------------------
 * La validación real es el `LoginSchema` de Zod que corre en el route handler. Duplicarla
 * acá produce dos mensajes distintos para el mismo error, y el que ve el usuario es el del
 * servidor. Acá solo se muestra el mensaje que YA viene formateado desde la API
 * (`{ error: { code, message } }`), así el texto se escribe una sola vez.
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

      /**
       * POR QUÉ SOLO `push` Y NO `refresh()` + `push()`
       * ------------------------------------------------
       * Llamar a `router.refresh()` y a `router.push()` en el mismo tick hace que Next
       * intente revalidar la ruta ACTUAL (/login) mientras ya navega a otra. Las dos
       * operaciones compiten por el mismo router cache y el fallo es intermitente: a
       * veces la pantalla destino se renderiza con el estado viejo y Next muestra el
       * mensaje de que la página no pudo cargar.
       *
       * `push` a una ruta que todavía no fue visitada pide un render nuevo en el
       * servidor, que lee la cookie recién seteada. No hace falta refrescar antes.
       *
       * Se usa `replace` y no `push` para que el botón "atrás" no devuelva al login
       * con una sesión ya iniciada.
       */
      router.replace(destino);
    } catch {
      setError("Error de conexión. Revisá que el servidor esté corriendo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-tierra-200 bg-white p-8">
      <div className="mb-5 h-1.5 w-14 rounded-full bg-azul-800" />
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
            className={input}
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
            className={input}
          />
        </div>

        {error && (
          <p role="alert" className={alertaError}>
            {error}
          </p>
        )}

        <button type="submit" disabled={enviando} className={`w-full ${btnPrimario}`}>
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
