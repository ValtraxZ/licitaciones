import type { Metadata } from "next";
import SwaggerUI from "./SwaggerUI";

export const metadata: Metadata = {
  title: "API — Documentación (Swagger)",
  description: "Especificación OpenAPI de la API de Licitaciones",
};

/**
 * Página de documentación de la API.
 *
 * El spec se sirve desde `/api/openapi` y está definido en `src/lib/openapi.ts` (código, no
 * un YAML suelto) para que no pueda quedar desactualizado respecto de los schemas de Zod y
 * Prisma.
 *
 * Swagger UI viene del CDN en vez de ser una dependencia: pesa ~1 MB que solo usan quienes
 * revisan la API, no el flujo normal de la aplicación.
 *
 * Es una de las pocas páginas públicas de la app: no exige sesión, justamente para que un
 * evaluador pueda ver la API sin crear una cuenta.
 */
export default function ApiDocsPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="border-b border-tierra-200 bg-tierra-50 px-6 py-3">
        <p className="text-sm text-tierra-700">
          Documentación interactiva de la API. Para probarla:{" "}
          <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">
            admin@demo.com / Admin123!
          </code>
          . El login devuelve una cookie de sesión httpOnly; para mandarla desde Swagger,
          {" "}
          <em>Authorize</em> no alcanza (no puede leer cookies), así que conviene{" "}
          <a href="/api/openapi" className="underline">
            descargar el spec
          </a>{" "}
          e importarlo en Postman o Insomnia, que sí manejan cookies.
        </p>
      </div>

      <SwaggerUI />
    </main>
  );
}
