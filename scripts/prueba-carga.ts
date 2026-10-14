/**
 * Rampa de concurrencia contra produccion.
 *
 * Sirve para responder dos preguntas que el sintoma "todo da 500" no responde:
 *
 *   1. ¿Falla lo que TOCA LA BASE o falla todo? Si /api/openapi y /api/auth/me
 *      (que no consultan la base) sobreviven mientras /api/clientes no, es la base.
 *   2. ¿A partir de CUÁNTAS requests concurrentes empieza? Un umbral concreto dice si
 *      esto affects a un usuario real o solo a una prueba de carga sintética.
 */

const PROD = process.env.SMOKE_BASE_URL ?? "https://licitaciones-mu-sepia.vercel.app";

// Las que pegan a la base, y las que no.
const CON_BASE = ["/api/clientes", "/api/productos", "/api/licitaciones"];
const SIN_BASE = ["/api/openapi", "/api/auth/me"];

let errores = 0;

async function login(): Promise<string> {
  const res = await fetch(`${PROD}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@demo.com", password: "Admin123!" }),
  });
  if (!res.ok) throw new Error(`login fallo: ${res.status}`);
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

async function una(cookie: string, ruta: string): Promise<number> {
  try {
    const res = await fetch(`${PROD}${ruta}`, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(30_000),
    });
    await res.text();
    if (res.status >= 500) errores++;
    return res.status;
  } catch {
    errores++;
    return 0;
  }
}

function resumen(codigos: number[]): string {
  const c200 = codigos.filter((c) => c === 200).length;
  const c5xx = codigos.filter((c) => c >= 500).length;
  const otros = codigos.length - c200 - c5xx;
  return `${c200} ok · ${c5xx} con 5xx${otros ? ` · ${otros} otros` : ""}`;
}

async function main() {
  console.log(`Rampa de concurrencia contra ${PROD}\n${"=".repeat(62)}`);

  console.log("\n--- endpoints SIN base de datos ---");
  const cookie = await login();
  for (const c of [1, 5, 10, 20, 40]) {
    const t0 = Date.now();
    const rs = await Promise.all(
      Array.from({ length: c }, (_, i) => una(cookie, SIN_BASE[i % SIN_BASE.length])),
    );
    console.log(`  ${String(c).padStart(2)} a la vez: ${resumen(rs)}  (${Date.now() - t0}ms)`);
  }

  console.log("\n--- endpoints QUE TOCAN la base de datos ---");
  for (const c of [1, 2, 3, 5, 10, 20, 40]) {
    const t0 = Date.now();
    const rs = await Promise.all(
      Array.from({ length: c }, (_, i) => una(cookie, CON_BASE[i % CON_BASE.length])),
    );
    console.log(`  ${String(c).padStart(2)} a la vez: ${resumen(rs)}  (${Date.now() - t0}ms)`);
  }

  console.log(`\n${"=".repeat(62)}`);
  console.log(errores === 0 ? "Sin errores de servidor." : `Errores de servidor: ${errores}`);
}

main().catch((e) => {
  console.error("Error:", (e as Error).message);
  process.exit(1);
});
