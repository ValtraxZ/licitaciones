"use client";

import Script from "next/script";

/**
 * Monta Swagger UI.
 *
 * Va en un componente cliente y no en la página directamente por dos razones concretas:
 *
 * 1. `onLoad` es un handler de evento. Next.js no permite pasar funciones a un componente
 *    cliente desde uno de servidor, así que tiene que vivir acá.
 * 2. Escuchar el evento `load` de la ventana NO sirve. `next/script` con `afterInteractive`
 *    inyecta los `<script>` después de la hidratación del HTML, y para entonces `load` ya
 *    disparó: el listener quedaría registrado para un evento que nunca vuelve a pasar y la
 *    página se vería vacía. `onLoad` del propio `<Script>` sí dispara cuando el bundle
 *    terminó de cargarse, que es justo lo que hace falta acá.
 */
export default function SwaggerUI() {
  return (
    <>
      <Script
        id="swagger-ui-bundle"
        src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"
        strategy="afterInteractive"
        onLoad={() => {
          window.SwaggerUIBundle?.({
            url: "/api/openapi",
            dom_id: "#swagger-ui",
            deepLinking: true,
            displayRequestDuration: true,
            persistAuthorization: true,
            docExpansion: "list",
            defaultModelsExpandDepth: 1,
            tryItOutEnabled: true,
          });
        }}
      />

      {/* CSS del tema. Sin esto Swagger muestra todo sin estilos. */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
        crossOrigin="anonymous"
      />

      <div id="swagger-ui" className="mx-auto max-w-6xl p-6" />
    </>
  );
}
