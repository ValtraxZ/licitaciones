/**
 * Reproduce localmente el rechazo del pooler para VER el error real.
 *
 * En produccion no se puede ver: `responderError` oculta el detalle y los logs viven en
 * Vercel. Acá se reproduce la misma condicion (pool chico + muchas queries simultaneas)
 * en un proceso local, donde el error se puede imprimir.
 *
 *   npx tsx --env-file=.env scripts/repro-error-pool.ts
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.DATABASE_URL!;
const conPoolChico = `${BASE}${BASE.includes("?") ? "&" : "?"}connection_limit=2`;

console.log("pool simulado: connection_limit=2\n");

const prisma = new PrismaClient({ datasourceUrl: conPoolChico, log: ["error"] });

async function una(i: number) {
  const t0 = Date.now();
  try {
    const n = await prisma.usuario.count();
    return `  ${i}: OK (${Date.now() - t0}ms) n=${n}`;
  } catch (e) {
    const err = e as { code?: string; name?: string; message?: string; constructor?: { name?: string } };
    return (
      `  ${i}: FALLA (${Date.now() - t0}ms)\n` +
      `       constructor = ${err.constructor?.name}\n` +
      `       code        = ${err.code ?? "(sin code)"}\n` +
      `       message     = ${String(err.message).slice(0, 220)}`
    );
  }
}

async function main() {
  const N = 24;
  const resultados = await Promise.all(Array.from({ length: N }, (_, i) => una(i + 1)));

  console.log(resultados.join("\n"));

  const fallas = resultados.filter((r) => r.includes("FALLA")).length;
  console.log(`\n${N - fallas}/${N} pasaron, ${fallas} fallaron`);

  if (fallas > 0) {
    const codigos = new Set(
      resultados
        .filter((r) => r.includes("FALLA"))
        .map((r) => r.match(/code\s+= (.+)/)?.[1]?.trim())
        .filter(Boolean),
    );
    console.log(`codigos de error vistos: ${[...codigos].join(", ")}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", (e as Error).message);
  process.exit(1);
});
