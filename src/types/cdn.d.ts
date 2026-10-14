/**
 * Tipos globales de librerías que se cargan desde el CDN.
 *
 * Swagger UI viene de unpkg, así que no hay paquete instalado del cual importar tipos.
 * Declarar la firma acá permite que `SwaggerUI.tsx` se typeche de verdad en vez de tener
 * que castear a `any` y perder el autocompletado de las opciones del bundle.
 */
export {};

declare global {
  interface SwaggerUIBundleOptions {
    url?: string;
    dom_id?: string;
    deepLinking?: boolean;
    displayRequestDuration?: boolean;
    persistAuthorization?: boolean;
    docExpansion?: "list" | "full" | "none";
    defaultModelsExpandDepth?: number;
    tryItOutEnabled?: boolean;
  }

  interface Window {
    SwaggerUIBundle?: (opciones: SwaggerUIBundleOptions) => void;
  }
}
