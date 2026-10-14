export {};

/**
 * Verifica que todas las páginas internas respondan 200 con el HTML esperado
 * (y que un usuario NO admin sea redirigido en vez de ver una pantalla de error).
 *
 *   npx tsx --env-file=.env scripts/ver-paginas.ts
 */
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

async function sesion(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (!res.ok) throw new Error(`login falló: ${res.status}`);
  return cookie;
}

async function pagina(cookie: string, ruta: string) {
  const res = await fetch(`${BASE}${ruta}`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  const html = await res.text();
  return { status: res.status, location: res.headers.get("location"), html };
}

let fallos = 0;
function ok(cond: boolean, msg: string, extra = "") {
  if (cond) console.log(`  OK   ${msg}`);
  else {
    fallos++;
    console.log(`  FALLA ${msg}${extra ? `  -> ${extra}` : ""}`);
  }
}

async function main() {
  console.log(`\nVerificacion de paginas contra ${BASE}\n${"=".repeat(56)}`);

  const admin = await sesion("admin@demo.com", "Admin123!");
  const user = await sesion("user@demo.com", "User123!");

  const licitaciones = (await pagina(admin, "/api/licitaciones")).html;
  const listado = JSON.parse(licitaciones);
  const primera = listado.data?.[0]?.id;

  console.log("\nCon sesion ADMIN:");
  const paginas: Array<[string, string]> = [
    ["/dashboard", "Panel de licitaciones"],
    ["/licitaciones", "Nueva licitación"],
    ["/clientes", "Nuevo cliente"],
    ["/productos", "Nuevo producto"],
    ["/usuarios", "solo un ADMIN puede crear usuarios"],
  ];
  if (primera) paginas.push([`/licitaciones/${primera}`, "Historial de transiciones"]);

  for (const [ruta, esperado] of paginas) {
    const r = await pagina(admin, ruta);
    const bien = r.status === 200 && r.html.includes(esperado) && !r.html.includes("Application error");
    ok(bien, `${ruta} -> 200 y contiene "${esperado}"`,
      `status=${r.status} error=${r.html.includes("Application error")}`);
  }

  console.log("\nVerificacion del logout (el bug reportado):");
  const sinCookie = await pagina("", "/dashboard");
  ok(
    sinCookie.status === 307 && (sinCookie.location ?? "").includes("/login"),
    "sin sesion redirige a /login",
    `status=${sinCookie.status} location=${sinCookie.location}`,
  );
  ok(
    !sinCookie.html.includes('"ok":true'),
    "no muestra JSON crudo en pantalla",
  );

  console.log("\nCon sesion USER (debe redirigir, no romper):");
  const usuariosUser = await pagina(user, "/usuarios");
  ok(
    usuariosUser.status === 307 && (usuariosUser.location ?? "").includes("/dashboard"),
    "/usuarios redirige al panel en vez de mostrar error",
    `status=${usuariosUser.status} location=${usuariosUser.location}`,
  );
  const panelUser = await pagina(user, "/dashboard");
  ok(panelUser.status === 200, "/dashboard funciona para USER", `status=${panelUser.status}`);

  console.log("\nDocumentacion de la API (publica a proposito):");
  // Sin cookie: la documentacion tiene que poder consultarse sin iniciar sesion, si no el
  // evaluador tendria que crear una cuenta solo para ver el spec.
  const docs = await pagina("", "/api-docs");
  ok(
    docs.status === 200 && docs.html.includes('id="swagger-ui"'),
    "/api-docs responde 200 sin sesion y monta Swagger UI",
    `status=${docs.status}`,
  );

  const spec = await fetch(`${BASE}/api/openapi`);
  const cuerpo = await spec.json();
  const rutas = Object.keys(cuerpo.paths ?? {});
  ok(spec.status === 200 && cuerpo.openapi?.startsWith("3."), "el spec declara una version de OpenAPI 3", `status=${spec.status}`);
  ok(
    rutas.includes("/api/licitaciones") && rutas.includes("/api/cron/licitaciones"),
    "el spec incluye los endpoints de licitaciones y el cron",
    `rutas=${rutas.length}`,
  );
  ok(
    (cuerpo.info?.description ?? "").includes("centavos"),
    "el spec documenta que los montos van en centavos",
  );

  console.log(`\n${"=".repeat(56)}`);
  console.log(fallos === 0 ? "\nTodas las paginas OK\n" : `\n${fallos} con error\n`);
  if (fallos > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
