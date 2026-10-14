/**
 * Benchmark de configuración de conexión a Supabase.
 * Mide la misma consulta con distintas combinaciones de pooler/pgbouncer/connection_limit
 * para descubrir cuál es la rápida. Se borra cuando la configuración esté definida.
 */
import { PrismaClient } from "@prisma/client";

const PW = encodeURIComponent(process.env.PROBE_PW!);
const REF = process.env.PROBE_REF!;
const HOST = "aws-1-us-west-2.pooler.supabase.com";

type Config = {
  nombre: string;
  url: string;
};

const configs: Config[] = [
  {
    nombre: "A: pooler 5432, pgbouncer=true, limit=1  (actual)",
    url: `postgresql://postgres.${REF}:${PW}@${HOST}:5432/postgres?sslmode=require&pgbouncer=true&connection_limit=1`,
  },
  {
    nombre: "B: pooler 5432, sin pgbouncer, limit=5",
    url: `postgresql://postgres.${REF}:${PW}@${HOST}:5432/postgres?sslmode=require&connection_limit=5`,
  },
  {
    nombre: "C: pooler 6543, pgbouncer=true, limit=1",
    url: `postgresql://postgres.${REF}:${PW}@${HOST}:6543/postgres?sslmode=require&pgbouncer=true&connection_limit=1`,
  },
  {
    nombre: "D: pooler 6543, sin pgbouncer, limit=5",
    url: `postgresql://postgres.${REF}:${PW}@${HOST}:6543/postgres?sslmode=require&connection_limit=5`,
  },
];

async function medir(cfg: Config) {
  const client = new PrismaClient({ datasources: { db: { url: cfg.url } }, log: [] });
  const muestras: number[] = [];
  try {
    for (let i = 0; i < 6; i++) {
      const a = Date.now();
      await client.licitacion.count();
      muestras.push(Date.now() - a);
    }
    await client.$disconnect();
    // La primera muestra incluye el handshake; las siguientes sonqueries con conexión viva.
    const estable = muestras.slice(1);
    const media = Math.round(estable.reduce((x, y) => x + y, 0) / estable.length);
    return { ok: true, primera: muestras[0], media, max: Math.max(...estable) };
  } catch (e) {
    await client.$disconnect().catch(() => {});
    return { ok: false, err: (e as Error).message.split("\n").slice(0, 2).join(" | ").slice(0, 90) };
  }
}

async function main() {
  console.log(`\n=== Latencia de consulta segun configuracion ===\n`);
  for (const cfg of configs) {
    const r = await medir(cfg);
    if (r.ok) {
      console.log(`${cfg.nombre}`);
      console.log(`    primera (handshake): ${r.primera} ms   media: ${r.media} ms   peor: ${r.max} ms`);
    } else {
      console.log(`${cfg.nombre}\n    ERROR: ${r.err}`);
    }
    console.log("");
  }
}

main();
