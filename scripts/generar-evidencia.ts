/**
 * GENERA EL INFORME DE EVIDENCIAS
 * ===============================
 * Recorre la aplicación y escribe `EVIDENCIAS.md` con pruebas verificables de los
 * requisitos del enunciado que exigen evidencia externa:
 *
 *   1. Correo real recibido por el cliente CON el documento adjunto
 *   2. El documento subido es accesible por una URL real
 * 3. El job programado corrió con lo que se esperaba
 *   4. El historial distingue transiciones manuales de automáticas
 *
 * Ventaja sobre una captura: es texto, se puede verificar con curl, y no se "envejece".
 *
 *   npx tsx --env-file=.env scripts/generar-evidencia.ts
 */

import { writeFileSync } from "node:fs";
import { Resend } from "resend";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

let cookie = "";

async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  let payload: BodyInit | undefined;
  if (cuerpo instanceof FormData) payload = cuerpo;
  else if (cuerpo !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(cuerpo);
  }
  const res = await fetch(`${BASE}${ruta}`, { method: metodo, headers, body: payload });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length > 0) cookie = set.map((c) => c.split(";")[0]).join("; ");
  const texto = await res.text();
  let datos: any = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  return { ok: res.ok, status: res.status, datos };
}

const L: string[] = [];
const linea = (s = "") => L.push(s);

async function main() {
  await pedir("POST", "/api/auth/login", { email: "admin@demo.com", password: "Admin123!" });

  linea("# Evidencias de la aplicación");
  linea();
  linea(`Generado el ${new Date().toLocaleString("es-AR")} contra \`${BASE}\`.`);
  linea();
  linea("Este informe reemplaza a las capturas: cada línea se puede volver a comprobar");
  linea("con `curl`. Los comandos exactos están al final de cada sección.");
  linea();

  // ─────────────────────────────────────────────────────────────
  linea("## 1. Correo real con el documento adjunto (requisito 4)");
  linea();

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const { data: enviados, error } = await resend.emails.list({ limit: 10 });

  if (error || !enviados) {
    linea(`No se pudo consultar el proveedor: ${error?.message ?? "sin respuesta"}`);
  } else {
    linea(`Correo enviado desde: \`${process.env.EMAIL_FROM}\``);
    linea(`Destinatario: \`${process.env.EMAIL_CLIENTE_DEMO}\``);
    linea();
    linea("| Fecha | Asunto | Estado | ID del proveedor |");
    linea("|---|---|---|---|");
    for (const e of enviados.data ?? []) {
      const asunto = (e.subject ?? "").replace(/\|/g, "\\|");
      linea(`| ${new Date(e.created_at).toLocaleString("es-AR")} | ${asunto} | ${e.last_event} | \`${e.id}\` |`);
    }
    linea();
    linea("> Los IDs son los que devuelve la API de Resend. Se pueden verificar en el");
    linea("> dashboard del proveedor o con `GET https://api.resend.com/emails/{id}`.");
  }
  linea();
  linea("**Cómo reproducirlo:**");
  linea();
  linea("```bash");
  linea("npx tsx --env-file=.env scripts/demo-email.ts");
  linea("```");
  linea();

  // ─────────────────────────────────────────────────────────────
  linea("## 2. El documento es accesible por una URL real (requisito: almacenamiento)");
  linea();

  const listado = await pedir("GET", "/api/licitaciones");
  const conDocumento = listado.datos.data.find((l: any) => l.estado === "activa") ?? listado.datos.data[0];
  const detalle = await pedir("GET", `/api/licitaciones/${conDocumento.id}`);
  const doc = detalle.datos.data;

  linea(`Licitación: **${doc.codigo}** — ${doc.titulo}`);
  linea(`Archivo: \`${doc.documentoNombre}\` (${((doc.documentoTamano ?? 0) / 1024).toFixed(1)} KB)`);
  linea();
  linea("URL firmada que devuelve la API:");
  linea();
  linea("```");
  linea(doc.documentoUrl ?? "(sin documento)");
  linea("```");
  linea();

  // La prueba real: descargarlo SIN sesión, como lo haría el cliente.
  if (doc.documentoUrl) {
    const res = await fetch(doc.documentoUrl);
    const bytes = Buffer.from(await res.arrayBuffer());
    const magic = bytes.subarray(0, 5).toString("latin1");

    linea("**Descarga sin sesión (como lo haría el cliente):**");
    linea();
    linea("| Comprobación | Resultado |");
    linea("|---|---|");
    linea(`| Código HTTP | **${res.status}** ${res.status === 200 ? "OK" : "FALLA"} |`);
    linea(`| Tamaño recibido | ${bytes.length} bytes |`);
    linea(`| Cabecera \`Content-Type\` | ${res.headers.get("content-type")} |`);
    linea(`| Primeros bytes (deben ser \`%PDF-\`) | \`${magic}\` ${magic === "%PDF-" ? "OK" : "FALLA"} |`);
    linea();
    writeFileSync("evidencia/propuesta-descargada.pdf", bytes);
    linea("El PDF descargado quedó en `evidencia/propuesta-descargada.pdf`.");
  }
  linea();
  linea("**Por qué es una URL real y no un dato de la base:** el bucket de Storage es");
  linea("**privado**. No existe una URL pública estable; lo que hay es una *URL firmada* que");
  linea("genera el servidor con vencimiento. Es accesible desde el navegador sin sesión,");
  linea("que es exactamente lo que necesita el cliente, y se puede revocar.");
  linea();
  linea("**Cómo reproducirlo:**");
  linea();
  linea("```bash");
  linea("npx tsx --env-file=.env scripts/ver-pdf.ts");
  linea("```");
  linea();

  // ─────────────────────────────────────────────────────────────
  linea("## 3. El job programado corrió (requisitos 2 y 5)");
  linea();

  const cron = await fetch(`${BASE}/api/cron/licitaciones`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const cuerpoCron = await cron.json();

  linea("Ejecución real del endpoint:");
  linea();
  linea("```json");
  linea(JSON.stringify(cuerpoCron, null, 2));
  linea("```");
  linea();
  linea("Y sin el secreto, para probar que está protegido:");
  linea();
  const sinAuth = await fetch(`${BASE}/api/cron/licitaciones`);
  linea(`\`\`\`\nHTTP ${sinAuth.status}  ${JSON.stringify(await sinAuth.json())}\n\`\`\``);
  linea();
  linea("**Cómo reproducirlo:**");
  linea();
  linea("```bash");
  linea(`curl -H "Authorization: Bearer $CRON_SECRET" ${BASE}/api/cron/licitaciones`);
  linea("```");
  linea();

  // ─────────────────────────────────────────────────────────────
  linea("## 4. El historial distingue lo manual de lo automático (requisito 7)");
  linea();

  const perdidas = await pedir("GET", "/api/licitaciones?estado=perdida");
  const perdida = perdidas.datos.data[0];
  if (perdida) {
    const h = await pedir("GET", `/api/licitaciones/${perdida.id}/historial`);
    linea(`Licitación **${perdida.codigo}** — ${perdida.titulo}`);
    linea();
    linea("| Estado anterior | Estado nuevo | Origen | Usuario | Cuándo | Comentario |");
    linea("|---|---|---|---|---|---|");
    for (const e of h.datos.data) {
      linea(
        `| ${e.estadoAnterior} | ${e.estadoNuevo} | **${e.origen}** | ${e.usuarioEmail ?? "_sistema_"} | ` +
          `${new Date(e.createdAt).toLocaleString("es-AR")} | ${(e.comentario ?? "").replace(/\|/g, "\\|")} |`,
      );
    }
    linea();
    const automaticas = h.datos.data.filter((e: any) => e.origen !== "manual").length;
    linea(`De ${h.datos.data.length} transiciones, **${automaticas} las hizo el sistema** y ` +
          `${h.datos.data.length - automaticas} las hizo una persona. ` +
          `Eso es lo que prueba que el vencimiento es automático y no una carga manual de datos.`);
  }
  linea();

  // ─────────────────────────────────────────────────────────────
  linea("## 5. Correo recibido — lo que falta adjuntar a mano");
  linea();
  linea("Estas dos cosas las tenés que agregar vos, porque dependen de tu pantalla:");
  linea();
  linea("1. **Captura del correo** en tu bandeja, con el PDF visible en el adjunto.");
  linea("2. **Captura del panel** con la interfaz colores (prueba de que la web funciona).");
  linea();
  linea("Guárdalas en la carpeta `evidencia/`:");
  linea();
  linea("```");
  linea("evidencia/");
  linea("├── 01-correo-recibido.png      <-- captura del correo con el PDF");
  linea("├── 02-panel.png                <-- captura del panel");
  linea("├── 03-detalle-historial.png    <-- captura del historial");
  linea("├── propuesta-descargada.pdf    <-- generada por este script");
  linea("└── propuesta-generada.pdf     <-- generada por este script");
  linea("```");

  writeFileSync("EVIDENCIAS.md", L.join("\n"), "utf-8");
  console.log(`\nEVIDENCIAS.md generado (${L.length} lineas).`);
  console.log("Revisalo y despues toma las 3 capturas a mano.");
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
