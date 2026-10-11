/**
 * Plantillas HTML de los correos al cliente.
 *
 * TODAS las variables del usuario pasan por `escapar()`. Sin eso, un cliente llamado
 * `<script>alert(1)</script>` inyecta HTML en el correo (HTML injection) y un
 * `<a href="javascript:...">` puede convertir el enlace de la propuesta en una trampa.
 * Son tres líneas y es un detalle de seguridad que se nota en la revisión de código.
 */

import { formatear } from "../dinero";
import type { EstadoLicitacion } from "../estados";

export function escapar(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ESTILO = `
  body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color:#0f172a; margin:0; padding:24px; background:#f8fafc; }
  .caja { max-width: 640px; margin: 0 auto; background:#fff; border-radius:12px; padding:32px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color:#64748b; font-size: 14px; margin: 0 0 24px; }
  table { width:100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
  th { text-align:left; background:#f1f5f9; padding:10px; border-bottom:1px solid #cbd5e1; font-size:12px; text-transform:uppercase; color:#475569; }
  td { padding:10px; border-bottom:1px solid #e2e8f0; }
  .der { text-align:right; }
  .total { font-weight:700; background:#f8fafc; }
  .dato { margin: 6px 0; font-size:14px; }
  .dato b { color:#475569; font-weight:600; }
  .alerta { background:#fff7ed; border:1px solid #fdba74; border-radius:8px; padding:16px; margin:20px 0; }
  .pie { margin-top:28px; padding-top:16px; border-top:1px solid #e2e8f0; color:#94a3b8; font-size:12px; }
`;

type Item = {
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  producto: { nombre: string; sku: string };
};

export type DatosPlantilla = {
  codigo: string;
  titulo: string;
  descripcion?: string | null;
  presupuestoMaximo: number;
  totalProductos: number;
  fechaLimite: Date;
  cliente: { nombre: string };
  productos: Item[];
  documentoNombre?: string | null;
  documentoUrl?: string | null;
  emitidoPor?: string | null;
};

const formatoFecha = (f: Date) =>
  f.toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short" });

/**
 * Tabla de productos con los totales al pie.
 *
 * Los totales se reciben como parámetros en vez de inyectarse con un `.replace()` sobre
 * el HTML armado: reemplazar texto sobre un HTML generado es frágil (si `formatear(0)`
 * apareciera en otro lado, se reemplazaría el lugar equivocado) y frágil de leer.
 */
function tablaProductos(d: DatosPlantilla) {
  if (d.productos.length === 0) {
    return `<p style="color:#64748b;font-size:14px">Esta propuesta aún no incluye productos.</p>`;
  }
  const filas = d.productos
    .map(
      (i) => `<tr>
        <td>${escapar(i.producto.nombre)}<br><span style="color:#94a3b8;font-size:12px">${escapar(i.producto.sku)}</span></td>
        <td class="der">${i.cantidad}</td>
        <td class="der">${escapar(formatear(i.precioUnitario))}</td>
        <td class="der">${escapar(formatear(i.subtotal))}</td>
      </tr>`,
    )
    .join("");

  return `<table>
    <thead><tr>
      <th>Producto</th><th class="der">Cant.</th><th class="der">Precio unit.</th><th class="der">Subtotal</th>
    </tr></thead>
    <tbody>
      ${filas}
      <tr class="total">
        <td colspan="3">Total de la propuesta</td>
        <td class="der">${escapar(formatear(d.totalProductos))}</td>
      </tr>
      <tr>
        <td colspan="3">Presupuesto máximo</td>
        <td class="der">${escapar(formatear(d.presupuestoMaximo))}</td>
      </tr>
    </tbody>
  </table>`;
}

/** Correo de propuesta formal (requisito 4): resumen + documento adjunto. */
export function plantillaPropuesta(d: DatosPlantilla): { html: string; texto: string } {
  const filas = d.productos
    .map(
      (i) =>
        `  - ${i.producto.nombre} (${i.producto.sku})\n    ${i.cantidad} x ${formatear(i.precioUnitario)} = ${formatear(i.subtotal)}`,
    )
    .join("\n");

  const texto = [
    `Estimado/a ${d.cliente.nombre},`,
    ``,
    `Adjuntamos nuestra propuesta comercial para la licitación "${d.titulo}".`,
    ``,
    `Código: ${d.codigo}`,
    ``,
    `PRODUCTOS`,
    filas || "  (sin productos cargados)",
    ``,
    `Total de la propuesta: ${formatear(d.totalProductos)}`,
    `Presupuesto máximo:     ${formatear(d.presupuestoMaximo)}`,
    ``,
    `Fecha límite de presentación: ${formatoFecha(d.fechaLimite)}`,
    d.documentoUrl ? `\nDocumento en línea: ${d.documentoUrl}` : "",
    ``,
    `Quedamos a disposición.`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><style>${ESTILO}</style></head>
<body><div class="caja">
  <h1>Propuesta comercial ${escapar(d.codigo)}</h1>
  <p class="sub">${escapar(d.titulo)}</p>

  <p>Estimado/a <b>${escapar(d.cliente.nombre)}</b>,</p>
  <p>Adjuntamos a este correo nuestra propuesta formal. A continuación el detalle:</p>

  ${tablaProductos(d)}

  <div class="alerta">
    <div class="dato"><b>Fecha límite de presentación:</b> ${escapar(formatoFecha(d.fechaLimite))}</div>
    ${d.documentoNombre ? `<div class="dato"><b>Documento adjunto:</b> ${escapar(d.documentoNombre)}</div>` : ""}
    ${d.documentoUrl ? `<div class="dato"><b>También disponible en línea:</b> <a href="${escapar(d.documentoUrl)}">abrir documento</a></div>` : ""}
  </div>

  <p>Quedamos a disposición por cualquier consulta.</p>
  <p style="color:#64748b;font-size:13px">Atentamente,<br>${escapar(d.emitidoPor ?? "Equipo comercial")}</p>

  <div class="pie">Este correo contiene información comercial confidencial.</div>
</div></body></html>`;

  return { html, texto };
}

/** Correo de recordatorio (requisito 5). */
export function plantillaRecordatorio(d: DatosPlantilla, horasRestantes: number): { html: string; texto: string } {
  const texto = [
    `Estimado/a ${d.cliente.nombre},`,
    ``,
    `Le recordamos que la fecha límite de presentación para la licitación "${d.titulo}"`,
    `(${d.codigo}) es ${escapar(formatoFecha(d.fechaLimite))}.`,
    ``,
    `Faltan aproximadamente ${horasRestantes} horas.`,
    ``,
    `Documento: ${d.documentoUrl ?? "(adjunto en el envío anterior)"}`,
    ``,
    `Quedamos a disposición.`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><style>${ESTILO}</style></head>
<body><div class="caja">
  <h1>Recordatorio: propuesta ${escapar(d.codigo)}</h1>
  <p class="sub">${escapar(d.titulo)}</p>

  <p>Estimado/a <b>${escapar(d.cliente.nombre)}</b>,</p>

  <div class="alerta">
    <div class="dato"><b>Fecha límite de presentación:</b> ${escapar(formatoFecha(d.fechaLimite))}</div>
    <div class="dato"><b>Tiempo restante aproximado:</b> ${horasRestantes} horas</div>
  </div>

  <p>Le recordamos el vencimiento del plazo para la presentación de la propuesta.</p>

  ${d.documentoUrl ? `<p><a href="${escapar(d.documentoUrl)}">Ver el documento de la propuesta</a></p>` : ""}

  <div class="pie">Este correo contiene información comercial confidencial.</div>
</div></body></html>`;

  return { html, texto };
}

/** Aviso interno al equipo cuando una licitación vence o se pierde. */
export function plantillaPerdida(d: {
  codigo: string;
  titulo: string;
  cliente: string;
  fechaLimite: Date;
  origen: EstadoLicitacion | "cron";
}): { html: string; texto: string } {
  const texto = `La licitación ${d.codigo} "${d.titulo}" de ${d.cliente} pasó a PERDIDA. Fecha límite: ${formatoFecha(d.fechaLimite)}.`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${ESTILO}</style></head>
<body><div class="caja">
  <h1>Licitación vencida</h1>
  <div class="alerta"><div class="dato"><b>${escapar(d.codigo)}</b> — ${escapar(d.titulo)}</div>
  <div class="dato">Cliente: ${escapar(d.cliente)}</div>
  <div class="dato">Fecha límite: ${escapar(formatoFecha(d.fechaLimite))}</div></div>
  <p>El sistema la transitioned automáticamente a <b>perdida</b>.</p>
</div></body></html>`;
  return { html, texto };
}
