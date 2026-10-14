/**
 * Descarga el PDF de una licitación a disco, para revisar cómo quedó generado.
 *   npx tsx --env-file=.env scripts/ver-pdf.ts
 */
import { writeFileSync } from "node:fs";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

let cookie = "";

async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  let payload: BodyInit | undefined;
  if (cuerpo !== undefined) {
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

async function main() {
  await pedir("POST", "/api/auth/login", { email: "admin@demo.com", password: "Admin123!" });

  const listado = await pedir("GET", "/api/licitaciones?estado=activa");
  if (!listado.ok) throw new Error(JSON.stringify(listado.datos));

  const licitacion = listado.datos.data[0];
  if (!licitacion) throw new Error("No hay licitaciones activas");

  const detalle = await pedir("GET", `/api/licitaciones/${licitacion.id}`);
  const doc = detalle.datos.data;

  console.log(`Licitación : ${doc.codigo}  ${doc.titulo}`);
  console.log(`Cliente    : ${doc.cliente.nombre}`);
  console.log(`Documento  : ${doc.documentoNombre}  (${(doc.documentoTamano / 1024).toFixed(1)} KB)`);
  console.log(`Productos  : ${doc.productos.length}`);
  console.log(`Total      : ${doc.totales ? "" : ""}${(doc.totalProductos / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}`);
  console.log(`\nURL firmada:\n${doc.documentoUrl}\n`);

  // Descarga la URL firmada en incógnito: es la evidencia de "accesible por URL real".
  const res = await fetch(doc.documentoUrl);
  const bytes = Buffer.from(await res.arrayBuffer());
  const destino = "evidencia/propuesta-generada.pdf";
  writeFileSync(destino, bytes);
  console.log(`Descargada sin sesión: HTTP ${res.status}, ${bytes.length} bytes`);
  console.log(`Guardada en: ${destino}`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
