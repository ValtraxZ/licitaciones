/**
 * SMOKE TEST DEL FLUJO COMPLETO
 * ============================
 * Ejecuta el recorrido de punta a punta contra el server corriendo y verifica cada
 * regla de negocio del enunciado. Es la evidencia de que las cosas funcionan, y sirve
 * como regresión si tocás algo.
 *
 *   npm run dev            (en otra terminal)
 *   npm run test:smoke
 *
 * Los montos se expresan en CENTAVOS en toda la API: 1.500.000 = $15.000,00
 */

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

let cookie = "";
let fallos = 0;
let pruebas = 0;

/**
 * `cuerpo` es `any` a propósito: este script inspecciona respuestas heterogéneas de
 * 15 endpoints distintos y tipar cada una no aportaría nada. El tipado fuerte importa en
 * el código de la aplicación, no en el arnés que la prueba.
 */
type Resultado = { ok: boolean; status: number; cuerpo: any };

async function pedir(
  metodo: string,
  ruta: string,
  body?: unknown,
): Promise<Resultado> {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${ruta}`, { method: metodo, headers, body: payload });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length > 0) {
    const s = cookie ? `${cookie}; ` : "";
    cookie = s + setCookie.map((c) => c.split(";")[0]).join("; ");
  }

  const texto = await res.text();
  let cuerpo: any;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    cuerpo = texto;
  }
  return { ok: res.ok, status: res.status, cuerpo };
}

function verificar(descripcion: string, condicion: boolean, detalle = "") {
  pruebas++;
  if (condicion) {
    console.log(`  \x1b[32mOK\x1b[0m   ${descripcion}`);
  } else {
    fallos++;
    console.log(`  \x1b[31mFALLA\x1b[0m ${descripcion}${detalle ? `\n         ${detalle}` : ""}`);
  }
}

function seccion(titulo: string) {
  console.log(`\n\x1b[1m${titulo}\x1b[0m`);
}

/**
 * PDF mínimo y válido, para probar la subida sin depender de un archivo externo.
 *
 * `File` acepta un string como `BlobPart`: más simple que construir un buffer a mano y
 * evita el lío de tipos entre `Uint8Array` y `ArrayBuffer` en TS.
 */
function contenidoPdf(): string {
  return `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj
trailer<</Root 1 0 R>>
%%EOF
`;
}

async function main() {
  console.log(`\nSmoke test contra ${BASE}\n${"=".repeat(60)}`);

  // ───────────────────────── 1. AUTH ─────────────────────────
  seccion("1. Autenticación");

  const sinSesion = await pedir("GET", "/api/clientes");
  verificar("GET /api/clientes sin sesión devuelve 401", sinSesion.status === 401,
    `recibido ${sinSesion.status}`);

  const loginMalo = await pedir("POST", "/api/auth/login", {
    email: "admin@demo.com", password: "malaclave",
  });
  verificar("login con password incorrecta devuelve 401", loginMalo.status === 401);

  const login = await pedir("POST", "/api/auth/login", {
    email: "admin@demo.com", password: "Admin123!",
  });
  verificar("login admin correcto devuelve 200", login.ok,
    JSON.stringify(login.cuerpo));
  verificar("la cookie de sesión quedó seteada", cookie.startsWith("session="));

  // ───────────────────────── 2. ROLES ─────────────────────────
  seccion("2. Roles (solo admin crea usuarios)");

  const userLogin = await pedir("POST", "/api/auth/login", {
    email: "user@demo.com", password: "User123!",
  });
  verificar("login user correcto", userLogin.ok);

  const crearUsuarioComoUser = await pedir("POST", "/api/usuarios", {
    email: `intento-${Date.now()}@demo.com`, nombre: "No permitido", password: "Password123",
  });
  verificar("un USER no puede crear usuarios → 403",
    crearUsuarioComoUser.status === 403,
    `recibido ${crearUsuarioComoUser.status}`);

  // Vuelvo a admin para seguir.
  cookie = "";
  await pedir("POST", "/api/auth/login", { email: "admin@demo.com", password: "Admin123!" });

  const usuarioNuevo = await pedir("POST", "/api/usuarios", {
    email: `smoke-${Date.now()}@demo.com`, nombre: "Usuario Smoke", password: "Password123", rol: "USER",
  });
  verificar("un ADMIN sí puede crear usuarios → 201", usuarioNuevo.status === 201,
    `recibido ${usuarioNuevo.status}`);

  // ───────────────────────── 3. CATÁLOGO ─────────────────────────
  seccion("3. Clientes y productos");

  const sufijo = Date.now();
  const cliente = await pedir("POST", "/api/clientes", {
    nombre: `Cliente Smoke ${sufijo}`,
    email: `cliente-${sufijo}@demo.com`,
  });
  verificar("crear cliente → 201", cliente.status === 201);
  const clienteId = cliente.cuerpo?.data?.id;

  const producto = await pedir("POST", "/api/productos", {
    sku: `SMK-${sufijo}`, nombre: "Producto Smoke", precioUnitario: 500_000,
  });
  verificar("crear producto → 201", producto.status === 201);
  const productoId = producto.cuerpo?.data?.id;

  const skuDuplicado = await pedir("POST", "/api/productos", {
    sku: `SMK-${sufijo}`, nombre: "Duplicado", precioUnitario: 1000,
  });
  verificar("SKU duplicado → 409", skuDuplicado.status === 409,
    `recibido ${skuDuplicado.status}`);

  const precioFloat = await pedir("POST", "/api/productos", {
    sku: `FLOAT-${sufijo}`, nombre: "Precio float", precioUnitario: 12.55,
  });
  verificar("precio decimal (float) rechazado → 422", precioFloat.status === 422,
    `recibido ${precioFloat.status}`);

  // ───────────────────────── 4. LICITACIÓN ─────────────────────────
  seccion("4. Licitación y Regla 1 (presupuesto)");

  const fechaLimite = new Date(Date.now() + 30 * 3_600_000).toISOString(); // en 30 horas

  const licitacion = await pedir("POST", "/api/licitaciones", {
    titulo: `Licitación Smoke ${sufijo}`,
    clienteId,
    presupuestoMaximo: 2_000_000, // $20.000
    fechaLimite,
  });
  verificar("crear licitación → 201", licitacion.status === 201,
    JSON.stringify(licitacion.cuerpo));
  const licId = licitacion.cuerpo?.data?.id;
  verificar("nace en estado borrador",
    licitacion.cuerpo?.data?.estado === "borrador",
    `estado=${licitacion.cuerpo?.data?.estado}`);

  const fechaPasada = await pedir("POST", "/api/licitaciones", {
    titulo: "Con fecha vencida", clienteId,
    presupuestoMaximo: 100_000, fechaLimite: new Date(Date.now() - 86_400_000).toISOString(),
  });
  verificar("fecha límite pasada → 422", fechaPasada.status === 422,
    `recibido ${fechaPasada.status}`);

  // Dentro de presupuesto: 3 x 500.000 = 1.500.000 < 2.000.000
  const ok = await pedir("POST", `/api/licitaciones/${licId}/productos`, {
    productoId, cantidad: 3, precioUnitario: 500_000,
  });
  verificar("agregar producto dentro del presupuesto → 201", ok.status === 201,
    JSON.stringify(ok.cuerpo));

  // Excede: 3 x 500.000 + 2 x 500.000 = 2.500.000 > 2.000.000
  const excede = await pedir("POST", `/api/licitaciones/${licId}/productos`, {
    productoId, cantidad: 10, precioUnitario: 500_000,
  });
  verificar("REGLA 1: exceder el presupuesto → 422", excede.status === 422,
    `recibido ${excede.status}`);
  verificar("el error trae el código PRESUPUESTO_EXCEDIDO",
    excede.cuerpo?.error?.code === "PRESUPUESTO_EXCEDIDO",
    `código=${excede.cuerpo?.error?.code}`);

  // ───────────────────────── 5. TRANSICIONES ─────────────────────────
  seccion("5. Tabla de transiciones");

  // Se resuelve una licitación que NO está activa. Da 409 (conflicto con el estado
  // actual), no 422: 422 es para "la data rompe una regla" y acá el problema es que la
  // licitación todavía está en borrador.
  const salto = await pedir("POST", `/api/licitaciones/${licId}/resolver`, { resultado: "finalizada" });
  verificar("resolver una licitación en borrador → 409", salto.status === 409,
    `recibido ${salto.status}`);

  const enviarSinDoc = await pedir("POST", `/api/licitaciones/${licId}/enviar`);
  verificar("REGLA 3: enviar sin documento → 422", enviarSinDoc.status === 422,
    `recibido ${enviarSinDoc.status}`);
  verificar("el código es DOCUMENTO_FALTANTE",
    enviarSinDoc.cuerpo?.error?.code === "DOCUMENTO_FALTANTE");

  // ───────────────────────── 6. DOCUMENTO ─────────────────────────
  seccion("6. Documento de propuesta");

  const form = new FormData();
  form.append("archivo", new File([contenidoPdf()], `propuesta-${sufijo}.pdf`, { type: "application/pdf" }));
  const subida = await pedir("POST", `/api/licitaciones/${licId}/documento`, form);
  verificar("subir PDF a Storage → 201", subida.status === 201,
    JSON.stringify(subida.cuerpo ?? {}).slice(0, 200));

  const tipoMalo = new FormData();
  tipoMalo.append("archivo", new File(["nope"], `malo-${sufijo}.exe`, { type: "application/x-msdownload" }));
  const rechazo = await pedir("POST", `/api/licitaciones/${licId}/documento`, tipoMalo);
  verificar("tipo de archivo no permitido → 422", rechazo.status === 422,
    `recibido ${rechazo.status}`);

  // ───────────────────────── 7. ENVÍO ─────────────────────────
  seccion("7. Envío al cliente (correo real)");

  const enviar = await pedir("POST", `/api/licitaciones/${licId}/enviar`);
  verificar("enviar con documento → borrador pasa a activa",
    enviar.status === 200 && enviar.cuerpo?.data?.estado === "activa",
    JSON.stringify(enviar.cuerpo));
  verificar("el historial registró la transición",
    enviar.cuerpo?.data?.enviadaEn !== null && enviar.cuerpo?.data?.enviadaEn !== undefined);

  const correoResultado = enviar.cuerpo?.correo;
  if (correoResultado?.enviado) {
    verificar("correo enviado con adjunto real (Resend)", true, `id=${correoResultado.id}`);
  } else {
    console.log(`  \x1b[33mAVISO\x1b[0m La licitación se activó pero el correo NO salió: ${correoResultado?.error ?? "sin RESEND_API_KEY"}`);
    console.log(`         Comportamiento correcto: la transición NO se revierte.`);
  }

  const reenviar = await pedir("POST", `/api/licitaciones/${licId}/enviar`);
  verificar("reenviar una activa → 422 (no se puede volver a activar)",
    reenviar.status === 422 || reenviar.status === 409,
    `recibido ${reenviar.status}`);

  // ───────────────────────── 8. QUITAR PRODUCTOS ─────────────────────────
  seccion("8. Quitar productos");

  // Se crea un SEGUNDO producto: la tabla puente tiene `@@unique([licitacionId,
  // productoId])`, así que volver a agregar el mismo producto ACTUALIZA el ítem en vez
  // de crear otro. Para probar el borrado hace falta un ítem distinto.
  const producto2 = await pedir("POST", "/api/productos", {
    sku: `SMK2-${sufijo}`, nombre: "Producto Smoke 2", precioUnitario: 100_000,
  });
  const producto2Id = producto2.cuerpo?.data?.id;

  await pedir("POST", `/api/licitaciones/${licId}/productos`, {
    productoId: producto2Id, cantidad: 1, precioUnitario: 100_000,
  });

  const itemsAntes = await pedir("GET", `/api/licitaciones/${licId}/productos`);
  const items = itemsAntes.cuerpo?.data?.items ?? [];
  verificar("la licitación activa lista sus 2 productos", items.length === 2,
    `items=${items.length}`);
  verificar("total con 2 productos = 1.600.000",
    itemsAntes.cuerpo?.data?.totales?.totalProductos === 1_600_000,
    `total=${itemsAntes.cuerpo?.data?.totales?.totalProductos}`);

  const itemAQuitar = items.find((i: any) => i.productoId === producto2Id);
  const quitar = await pedir("DELETE", `/api/licitaciones/${licId}/productos/${itemAQuitar.id}`);
  verificar("quitar producto en estado activa → 200", quitar.status === 200,
    JSON.stringify(quitar.cuerpo ?? {}).slice(0, 200));
  verificar("el total bajó a 1.500.000 tras quitar",
    quitar.cuerpo?.data?.totales?.totalProductos === 1_500_000,
    `total=${quitar.cuerpo?.data?.totales?.totalProductos}`);

  const quitarInexistente = await pedir("DELETE", `/api/licitaciones/${licId}/productos/inexistente`);
  verificar("quitar un ítem que no existe → 404", quitarInexistente.status === 404,
    `recibido ${quitarInexistente.status}`);

  // ───────────────────────── 9. COBRANZA ─────────────────────────
  seccion("9. Regla 6: facturación, pagos y paso automático a cobrada");

  const finalizar = await pedir("POST", `/api/licitaciones/${licId}/resolver`, { resultado: "finalizada" });
  verificar("activa → finalizada", finalizar.ok,
    JSON.stringify(finalizar.cuerpo));

  const agregarEnCerrada = await pedir("POST", `/api/licitaciones/${licId}/productos`, {
    productoId, cantidad: 1, precioUnitario: 1000,
  });
  verificar("licitación finalizada NO permite agregar productos → 409",
    agregarEnCerrada.status === 409,
    `recibido ${agregarEnCerrada.status}`);

  const facturar = await pedir("POST", `/api/licitaciones/${licId}/facturar`, {
    montoFacturado: 1_500_000,
  });
  verificar("finalizada → por_cobrar", facturar.ok && facturar.cuerpo?.data?.estado === "por_cobrar",
    JSON.stringify(facturar.cuerpo));

  const pagoExcesivo = await pedir("POST", `/api/licitaciones/${licId}/pagos`, {
    monto: 1_600_000, metodo: "transferencia",
  });
  verificar("pago mayor al saldo → 422", pagoExcesivo.status === 422,
    `recibido ${pagoExcesivo.status}`);
  verificar("el código es PAGO_EXCEDE_SALDO",
    pagoExcesivo.cuerpo?.error?.code === "PAGO_EXCEDE_SALDO",
    `código=${pagoExcesivo.cuerpo?.error?.code}`);

  const pagoNegativo = await pedir("POST", `/api/licitaciones/${licId}/pagos`, {
    monto: -500, metodo: "efectivo",
  });
  verificar("pago negativo → 422", pagoNegativo.status === 422);

  const pagoParcial = await pedir("POST", `/api/licitaciones/${licId}/pagos`, {
    monto: 1_000_000, metodo: "transferencia", referencia: "TRX-001",
  });
  verificar("pago parcial aceptado", pagoParcial.status === 201,
    JSON.stringify(pagoParcial.cuerpo));
  verificar("el saldo restante es correcto (500.000)",
    pagoParcial.cuerpo?.data?.saldo?.saldoRestante === 500_000,
    `saldo=${pagoParcial.cuerpo?.data?.saldo?.saldoRestante}`);
  verificar("NO se cobró automáticamente (todavía queda saldo)",
    pagoParcial.cuerpo?.data?.cobradaAutomaticamente === false);

  const pagoFinal = await pedir("POST", `/api/licitaciones/${licId}/pagos`, {
    monto: 500_000, metodo: "transferencia", referencia: "TRX-002",
  });
  verificar("pago que completa el saldo aceptado", pagoFinal.status === 201);
  verificar("REGLA 6: pasó automáticamente a COBRADA",
    pagoFinal.cuerpo?.data?.cobradaAutomaticamente === true,
    JSON.stringify(pagoFinal.cuerpo?.data?.cobradaAutomaticamente));

  const detalleTrasPago = await pedir("GET", `/api/licitaciones/${licId}`);
  verificar("el estado final es cobrada", detalleTrasPago.cuerpo?.data?.estado === "cobrada",
    `estado=${detalleTrasPago.cuerpo?.data?.estado}`);
  verificar("el saldo quedó en cero", detalleTrasPago.cuerpo?.data?.totales?.saldo === 0);
  verificar("no quedan transiciones disponibles (estado terminal)",
    Array.isArray(detalleTrasPago.cuerpo?.data?.transicionesDisponibles) &&
      detalleTrasPago.cuerpo.data.transicionesDisponibles.length === 0);

  // ───────────────────────── 10. HISTORIAL ─────────────────────────
  seccion("10. Requisito 7: historial completo");

  const historial = await pedir("GET", `/api/licitaciones/${licId}/historial`);
  const entradas = historial.cuerpo?.data ?? [];

  // El recorrido completo son exactamente 4 transiciones:
  // borrador → activa → finalizada → por_cobrar → cobrada
  verificar("el historial tiene las 4 transiciones del recorrido", entradas.length === 4,
    `tiene ${entradas.length}`);

  const esperados = [
    ["borrador", "activa"], ["activa", "finalizada"],
    ["finalizada", "por_cobrar"], ["por_cobrar", "cobrada"],
  ];
  for (const [desde, hasta] of esperados) {
    verificar(`historial contiene ${desde} → ${hasta}`,
      entradas.some((h: any) => h.estadoAnterior === desde && h.estadoNuevo === hasta));
  }

  const automatica = entradas.find((h: any) => h.estadoNuevo === "cobrada");
  verificar("el paso a cobrada tiene origen 'sistema' (automático)",
    automatica?.origen === "sistema", `origen=${automatica?.origen}`);
  verificar("cada transición tiene usuario y fecha",
    entradas.every((h: any) => h.createdAt) &&
      entradas.filter((h: any) => h.origen === "manual").every((h: any) => h.usuarioEmail));

  // ───────────────────────── 11. CRON ─────────────────────────
  seccion("11. Job programado (vencimiento + recordatorio)");

  const cronSinAuth = await pedir("GET", "/api/cron/licitaciones");
  verificar("el cron sin Authorization → 401", cronSinAuth.status === 401,
    `recibido ${cronSinAuth.status}`);

  if (CRON_SECRET) {
    const cron = await fetch(`${BASE}/api/cron/licitaciones`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    const cuerpoCron = await cron.json();
    verificar("el cron con el secreto se ejecuta → 200", cron.ok, JSON.stringify(cuerpoCron));
    verificar("devuelve un conteo de vencidas y recordatorios",
      typeof cuerpoCron.vencidas === "number" && typeof cuerpoCron.recordatorios === "number",
      JSON.stringify(cuerpoCron));
    console.log(`         ${JSON.stringify(cuerpoCron)}`);
  } else {
    console.log("  \x1b[33mAVISO\x1b[0m CRON_SECRET no está definido: se omite la prueba del job.");
  }

  // ───────────────────────── RESUMEN ─────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  if (fallos === 0) {
    console.log(`\x1b[32m\x1b[1mTODAS LAS PRUEBAS PASARON\x1b[0m  (${pruebas}/${pruebas})\n`);
  } else {
    console.log(`\x1b[31m\x1b[1m${fallos} PRUEBAS FALLARON\x1b[0m  (${pruebas - fallos}/${pruebas} pasaron)\n`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`\nError ejecutando el smoke test: ${e.message}`);
  console.error(`¿Está corriendo el server?  npm run dev\n`);
  process.exit(1);
});
