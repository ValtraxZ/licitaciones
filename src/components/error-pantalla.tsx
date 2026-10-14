"use client";

import { useEffect } from "react";

/**
 * Límite de error de las pantallas internas.
 *
 * POR QUÉ NO DEJAMOS QUE NEXT MUESTRE SU PANTALLA DE ERROR
 * ------------------------------------------------------
 * La pantalla por defecto de Next en desarrollo es un overlay técnico en inglés, con un
 * stack trace. Para alguien que usa la aplicación, "la página no pudo cargar" sin
 * explicación es un callejón sin salida: no sabe si reintentar, corregir algo o esperar.
 *
 * Acá el error se muestra con un mensaje accionable y un botón para reintentar, que es
 * lo que hace `reset()`.
 *
 * `useEffect` con `logError` permite reportar a un servicio externo; con `console.error`
 * alcanza para desarrollo y para tener el detalle en los logs de Vercel.
 */
export function ErrorPantalla({
  titulo = "No se pudo cargar la página",
  mensaje = "Ocurrió un error inesperado. Podés reintentar; si sigue fallando, revisá la conexión con la base de datos.",
  error,
  reset,
}: {
  titulo?: string;
  mensaje?: string;
  error?: Error & { digest?: string };
  reset?: () => void;
}) {
  useEffect(() => {
    console.error("[error de pagina]", error?.message, error?.digest ?? "");
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-tierra-100 p-6">
      <div className="w-full max-w-md rounded-xl border border-naranja-300 bg-white p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-naranja-100 text-lg text-naranja-800">
            !
          </span>
          <h1 className="text-lg font-semibold text-azul-900">{titulo}</h1>
        </div>

        <p className="mt-4 text-sm text-tierra-700">{mensaje}</p>

        {error?.digest && (
          <p className="mt-3 rounded-md bg-tierra-50 px-3 py-2 font-mono text-xs text-tierra-500">
            Referencia: {error.digest}
          </p>
        )}

        <div className="mt-6 flex gap-2">
          {reset && (
            <button
              onClick={reset}
              className="rounded-md bg-azul-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-azul-800"
            >
              Reintentar
            </button>
          )}
          <a
            href="/dashboard"
            className="rounded-md border border-tierra-300 px-4 py-2 text-sm font-medium text-tierra-700 transition-colors hover:bg-tierra-100"
          >
            Volver al panel
          </a>
        </div>
      </div>
    </main>
  );
}
