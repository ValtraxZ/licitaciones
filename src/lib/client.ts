"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

/**
 * Cliente HTTP para los formularios de la UI.
 *
 * POR QUÉ `fetch` A LA API Y NO SERVER ACTIONS
 * -------------------------------------------
 * La API REST ya está verificada por 54 pruebas de humo que recorren el flujo completo.
 * Un formulario que llama a la MISMA API reutiliza esas pruebas en vez de crear un
 * segundo camino de mutaciones que nadie probó.
 *
 * Además el mensaje de error sale YA formateado del backend
 * (`{ error: { code, message } }`): se escribe una sola vez, en el servidor. Una Server
 * Action devuelve errores propios y terminaría duplicando esa lógica.
 *
 * Tras una mutación se llama `router.refresh()`: revalida los Server Components para que
 * la tabla muestre el estado nuevo sin recalcular nada en el cliente.
 */

export class ErrorApi extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ErrorApi";
  }
}

export async function api<T = unknown>(
  ruta: string,
  opciones: { metodo?: string; cuerpo?: unknown } = {},
): Promise<T> {
  const { metodo = "GET", cuerpo } = opciones;

  const esForm = cuerpo instanceof FormData;

  const res = await fetch(ruta, {
    method: metodo,
    // Con FormData NO se pone Content-Type: el browser tiene que agregar el boundary
    // multipart. Si lo seteamos a mano, el servidor no puede parsear el archivo.
    headers: !esForm && cuerpo !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: esForm ? (cuerpo as FormData) : cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });

  const texto = await res.text();
  let datos: unknown = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = { error: { code: "RESPUESTA_INVALIDA", message: texto.slice(0, 200) } };
  }

  if (!res.ok) {
    const e = (datos as { error?: { code?: string; message?: string; details?: unknown } }).error;
    throw new ErrorApi(
      res.status,
      e?.code ?? "ERROR",
      e?.message ?? `Error ${res.status}`,
      e?.details,
    );
  }

  return (datos as { data: T }).data;
}

/**
 * Hook con el estado típico de un formulario: cargando, error y refresco.
 * Envuelve la acción para que no haya que repetir try/catch y setState en cada componente.
 */
export function useAccion<TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<unknown>) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ejecutar = useCallback(
    async (...args: TArgs) => {
      setCargando(true);
      setError(null);
      try {
        await fn(...args);
        router.refresh();
        return true;
      } catch (e) {
        // El mensaje viene formateado desde el backend. Solo se muestra `message`:
        // el `code` y el `details` son para depurar, no para el usuario final.
        setError(e instanceof Error ? e.message : "Error inesperado");
        return false;
      } finally {
        setCargando(false);
      }
    },
    [fn, router],
  );

  return { ejecutar, cargando, error, setError };
}
