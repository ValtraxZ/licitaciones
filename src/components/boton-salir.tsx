"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/client";
import { btnSecundario } from "@/lib/ui";

/**
 * Botón de cierre de sesión.
 *
 * POR QUÉ NO ES UN `<form method="post">`
 * ---------------------------------------
 * Un form HTML normal hace que el navegador NAVEGUE al endpoint. El endpoint devuelve
 * JSON, así que el usuario veía `{"data":{"ok":true}}` en pantalla cruda en lugar de
 * volver al login. La cookie se borraba igual, pero la experiencia era un error visible.
 *
 * Con fetch + `router.replace()` la petición va por debajo y la navegación la controla
 * la app. `replace` y no `push` para que el botón "atrás" no devuelva al panel ya
 * deslogueado.
 */
export function BotonSalir() {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    try {
      await api("/api/auth/logout", { metodo: "POST" });
      router.replace("/login");
      // Revalida para que el proxy deje de ver la cookie y proteja las rutas de nuevo.
      router.refresh();
    } catch {
      setSaliendo(false);
    }
  }

  return (
    <button type="button" onClick={salir} disabled={saliendo} className={btnSecundario}>
      {saliendo ? "Saliendo…" : "Salir"}
    </button>
  );
}
