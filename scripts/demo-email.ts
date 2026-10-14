/**
 * DEMO COMPLETA CON CORREO REAL
 * =============================
 * Corre el recorrido del enunciado de punta a punta contra la app y dispara los dos
 * correos reales: la propuesta con el PDF adjunto y el recordatorio de 48 h.
 *
 * Reproduce tres escenarios con fechas límite distintas para que el job tenga algo que
 * vencer y algo que recordar:
 *
 *   - vencida   → se envió a tiempo (activa) y DESPUÉS le pasó la fecha. El cron la
 *                 pasa a `perdida`. Es el escenario real: no se puede crear una
 *                 licitación con fecha pasada, porque la app lo rechaza con 422.
 *   - 30 horas  → activa y dentro de la ventana de 48 h: recibe recordatorio.
 *   - 5 días    → activa y fuera de la ventana: no recibe nada.
 *
 *   npx tsx --env-file=.env scripts/demo-email.ts
 */

import { PrismaClient } from "@prisma/client";

export {};

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

const prisma = new PrismaClient();
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
  if (set.length > 0) {
    cookie = (cookie ? `${cookie}; ` : "") + set.map((c) => c.split(";")[0]).join("; ");
  }
  const texto = await res.text();
  let datos: any = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  return { ok: res.ok, status: res.status, datos };
}

const horas = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString();

/** Crea la licitación completa (productos + PDF) y la envía, como haría un usuario. */
async function crearYEnviar(titulo: string, limite: string, productoId: string, cantidad: number) {
  const clientes = await pedir("GET", "/api/clientes");
  // Se elige el cliente cuyo email coincide con la casilla donde se puede recibir.
  const objetivo = process.env.EMAIL_CLIENTE_DEMO;
  const cliente =
    clientes.datos.data.find((c: any) => c.email === objetivo) ?? clientes.datos.data[0];

  const lic = await pedir("POST", "/api/licitaciones", {
    titulo,
    clienteId: cliente.id,
    presupuestoMaximo: 8_000_000,
    fechaLimite: limite,
    descripcion: "Licitación generada por la demo automática para validar correos reales.",
  });
  if (!lic.ok) throw new Error(`No se pudo crear: ${JSON.stringify(lic.datos)}`);

  const id = lic.datos.data.id;

  await pedir("POST", `/api/licitaciones/${id}/productos`, {
    productoId, cantidad, precioUnitario: 850_000,
  });

  // El PDF lo genera la propia app a partir de los productos cargados: asi el documento
  // y el detalle nunca muestran montos distintos.
  const generado = await pedir("POST", `/api/licitaciones/${id}/documento/generar`);
  if (!generado.ok) {
    throw new Error(`No se pudo generar el PDF: ${JSON.stringify(generado.datos)}`);
  }

  const envio = await pedir("POST", `/api/licitaciones/${id}/enviar`);
  if (!envio.ok) throw new Error(`No se pudo enviar: ${JSON.stringify(envio.datos)}`);

  return { id, codigo: lic.datos.data.codigo, titulo, correo: envio.datos.correo };
}

async function main() {
  console.log(`\nDemo con correo real contra ${BASE}\n${"=".repeat(64)}`);

  await pedir("POST", "/api/auth/login", { email: "admin@demo.com", password: "Admin123!" });
  const productos = await pedir("GET", "/api/productos");
  const productoId = productos.datos.data[0].id;

  console.log("\n1) Creando licitaciones y enviando la propuesta con el PDF adjunto\n");

  const vencida = await crearYEnviar(
    "Demo — se envió a tiempo y luego venció", horas(2), productoId, 2,
  );
  const porVencer = await crearYEnviar(
    "Demo — vence en 30 horas (recibe recordatorio)", horas(30), productoId, 3,
  );
  const normal = await crearYEnviar(
    "Demo — vence en 5 días (fuera de la ventana)", horas(120), productoId, 4,
  );

  const creadas = [vencida, porVencer, normal];
  for (const l of creadas) {
    console.log(`  ${l.codigo}  ${l.titulo}`);
    console.log(
      l.correo?.enviado
        ? `     correo con PDF adjunto : ENVIADO  id=${l.correo.id}`
        : `     correo                : NO ENVIADO  ${l.correo?.error ?? ""}`,
    );
  }

  // Se "pasa el tiempo": la fecha límite de la primera queda en el pasado.
  // Se hace directo en la base porque la API, correctamente, no permite crear ni
  // dejar una licitación con fecha vencida.
  await prisma.licitacion.update({
    where: { id: vencida.id },
    data: { fechaLimite: new Date(Date.now() - 2 * 3_600_000) },
  });
  console.log("\n2) Pasa el tiempo: la primera licitación queda fuera de plazo\n");

  console.log("3) Ejecutando el job programado\n");
  const cron = await fetch(`${BASE}/api/cron/licitaciones`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  const r = await cron.json();
  console.log(`     HTTP ${cron.status}  ${JSON.stringify(r)}`);
  console.log(`     vencidas por fecha límite : ${r.vencidas}`);
  console.log(`     recordatorios enviados     : ${r.recordatorios}`);

  console.log("\n4) Estado final de cada licitación\n");
  for (const l of creadas) {
    const d = await pedir("GET", `/api/licitaciones/${l.id}`);
    const h = await pedir("GET", `/api/licitaciones/${l.id}/historial`);
    const ultima = h.datos.data[0];
    console.log(`  ${l.codigo}  ${l.titulo}`);
    console.log(`     estado final : ${d.datos.data.estado}`);
    console.log(`     transiciones : ${h.datos.data.length}`);
    if (ultima) {
      console.log(`     última       : ${ultima.estadoAnterior} → ${ultima.estadoNuevo}  [${ultima.origen}]`);
      console.log(`     actor        : ${ultima.usuarioEmail ?? "sistema (sin usuario)"}`);
    }
  }

  console.log(`\n${"=".repeat(64)}`);
  console.log(`\nRevisá la casilla ${process.env.EMAIL_CLIENTE_DEMO}:`);
  console.log("  - 3 correos de propuesta, CADA UNO con el PDF adjunto");
  console.log("  - 1 correo de recordatorio (la de 30 h)");
  console.log("  - La de fecha vencida terminó en 'perdida', marcada por el job\n");
}

main()
  .catch((e) => {
    console.error("Error:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
