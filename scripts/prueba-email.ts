/**
 * Prueba directa de la integración con Resend.
 * Confirma que la API key funciona y muestra las restricciones del plan gratuito.
 *
 *   npx tsx --env-file=.env scripts/prueba-email.ts
 */
import { Resend } from "resend";

const key = process.env.RESEND_API_KEY;
const desde = process.env.EMAIL_FROM;
const destino = process.env.EMAIL_CLIENTE_DEMO;

if (!key || !desde || !destino) {
  console.error("Faltan RESEND_API_KEY, EMAIL_FROM o EMAIL_CLIENTE_DEMO en el entorno");
  process.exit(1);
}

const remitente: string = desde;
const receptor: string = destino;
const apiKey: string = key;
const resend = new Resend(apiKey);

// PDF mínimo para comprobar que el adjunto viaja de verdad.
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "utf-8",
);

async function main() {
  console.log(`API key : ${apiKey.slice(0, 12)}…`);
  console.log(`Desde   : ${remitente}`);
  console.log(`Destino : ${receptor}\n`);

  const simple = await resend.emails.send({
    from: remitente,
    to: receptor,
    subject: "Prueba de integración — sin adjunto",
    text: "Prueba de conexión con Resend.",
  });
  console.log(
    simple.error
      ? `SIN ADJUNTO  ->  ERROR: ${simple.error.message}`
      : `SIN ADJUNTO  ->  OK  id=${simple.data?.id}`,
  );

  const conAdjunto = await resend.emails.send({
    from: remitente,
    to: receptor,
    subject: "Prueba de integración — con adjunto",
    text: "Este mensaje lleva un PDF adjunto real.",
    attachments: [{ filename: "propuesta-prueba.pdf", content: pdf }],
  });
  console.log(
    conAdjunto.error
      ? `CON ADJUNTO  ->  ERROR: ${conAdjunto.error.message}`
      : `CON ADJUNTO  ->  OK  id=${conAdjunto.data?.id}`,
  );
}

main().catch((e: Error) => {
  console.error("Excepción:", e.message);
  process.exit(1);
});
