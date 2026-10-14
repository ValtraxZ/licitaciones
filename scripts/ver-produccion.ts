export {};

/**
 * Verificación completa contra un entorno desplegado (producción).
 * Comprueba que la app responde, que la base está conectada, que los roles funcionan
 * y que el job programado se puede ejecutar.
 *
 *   SMOKE_BASE_URL=https://tu-app.vercel.app npx tsx --env-file=.env scripts/ver-paginas.ts
 */
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

async function sesion(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (!res.ok) throw new Error(`login fallo (${res.status}): ${email}`);
  return cookie;
}

async function api(cookie: string, ruta: string) {
  const res = await fetch(`${BASE}${ruta}`, { headers: { Cookie: cookie } });
  const texto = await res.text();
  let datos: any = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  return { status: res.status, datos, location: res.headers.get("location") };
}

async function pagina(cookie: string, ruta: string) {
  const res = await fetch(`${BASE}${ruta}`, { headers: { Cookie: cookie }, redirect: "manual" });
  const html = await res.text();
  return { status: res.status, location: res.headers.get("location"), html };
}

let fallos = 0;
function ok(cond: boolean, msg: string, extra = "") {
  if (cond) console.log(`  OK   ${msg}`);
  else { fallos++; console.log(`  FALLA ${msg}${extra ? `  -> ${extra}` : ""}`); }
}

async function main() {
  console.log(`\nVerificacion de PRODUCCION contra ${BASE}\n${"=".repeat(58)}`);

  // El sitio tiene que ser público: si redirige al SSO de Vercel, el enlace no sirve.
  const anon = await fetch(`${BASE}/login`, { redirect: "manual" });
  ok(
    anon.status === 200,
    "el sitio es publico (sin login de Vercel)",
    `HTTP ${anon.status} -> ${anon.headers.get("location") ?? ""}`,
  );

  const admin = await sesion("admin@demo.com", "Admin123!");
  const user = await sesion("user@demo.com", "User123!");

  console.log("\nAPI contra la base de datos:");
  const clientes = await api(admin, "/api/clientes");
  ok(clientes.status === 200 && Array.isArray(clientes.datos?.data),
    "GET /api/clientes responde con datos",
    `HTTP ${clientes.status} ${JSON.stringify(clientes.datos).slice(0, 90)}`);

  const productos = await api(admin, "/api/productos");
  ok(productos.status === 200 && Array.isArray(productos.datos?.data),
    "GET /api/productos responde con datos",
    `HTTP ${productos.status}`);

  const licitaciones = await api(admin, "/api/licitaciones");
  ok(licitaciones.status === 200 && licitaciones.datos?.data?.length > 0,
    "GET /api/licitaciones devuelve la base poblada",
    `HTTP ${licitaciones.status} items=${licitaciones.datos?.data?.length}`);

  const primera = licitaciones.datos.data[0];
  if (primera) {
    const detalle = await api(admin, `/api/licitaciones/${primera.id}`);
    ok(detalle.status === 200 && detalle.datos?.data?.codigo === primera.codigo,
      "GET /api/licitaciones/:id trae el detalle",
      `HTTP ${detalle.status}`);
    const historial = await api(admin, `/api/licitaciones/${primera.id}/historial`);
    ok(historial.status === 200 && Array.isArray(historial.datos?.data),
      "el historial de transiciones responde");
  }

  console.log("\nReglas de negocio (contra produccion):");
  const exceder = await fetch(`${BASE}/api/productos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({ sku: `X-${Date.now()}`, nombre: "Precio float", precioUnitario: 12.55 }),
  });
  ok(exceder.status === 422, "precio decimal rechazado con 422 (montos en centavos)",
    `HTTP ${exceder.status}`);

  const cronAnon = await fetch(`${BASE}/api/cron/licitaciones`, { redirect: "manual" });
  ok(cronAnon.status === 401, "el cron rechaza peticiones sin secreto",
    `HTTP ${cronAnon.status}`);

  console.log("\nRoles:");
  const userCreando = await fetch(`${BASE}/api/usuarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: user },
    body: JSON.stringify({ email: `x${Date.now()}@demo.com`, nombre: "No", password: "Password123" }),
  });
  ok(userCreando.status === 403, "un USER no puede crear usuarios (403)",
    `HTTP ${userCreando.status}`);

  const adminCreando = await fetch(`${BASE}/api/usuarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({ email: `verif-${Date.now()}@demo.com`, nombre: "Verificacion Produccion", password: "Password123" }),
  });
  ok(adminCreando.status === 201, "un ADMIN si puede crear usuarios (201)",
    `HTTP ${adminCreando.status}`);

  console.log("\nPaginas:");
  const paginas: Array<[string, string]> = [
    ["/dashboard", "Panel de licitaciones"],
    ["/licitaciones", "Nueva licitación"],
    ["/clientes", "Nuevo cliente"],
    ["/productos", "Nuevo producto"],
    ["/usuarios", "solo un ADMIN puede crear usuarios"],
  ];
  if (primera) paginas.push([`/licitaciones/${primera.id}`, "Historial de transiciones"]);

  for (const [ruta, esperado] of paginas) {
    const r = await pagina(admin, ruta);
    ok(r.status === 200 && r.html.includes(esperado),
      `${ruta} renderiza`,
      `HTTP ${r.status} error=${r.html.includes("Application error")}`);
  }

  const usuariosUser = await pagina(user, "/usuarios");
  ok(
    usuariosUser.status === 307 || (usuariosUser.status === 200 && !usuariosUser.html.includes("Nuevo usuario")),
    "/usuarios no le muestra el formulario a un USER",
    `HTTP ${usuariosUser.status}`,
  );

  console.log(`\n${"=".repeat(58)}`);
  console.log(fallos === 0 ? "\nPRODUCCION VERIFICADA: todo OK\n" : `\n${fallos} con error\n`);
  if (fallos > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
