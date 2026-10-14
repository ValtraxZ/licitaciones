import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { urlDeConexion } from "../db";

/**
 * La URL de conexión decide cuántos sockets abre la aplicación contra el pooler.
 *
 * Estos tests existen porque el error que previenen es invisible: con el pool saturado
 * la app no se cae "mal", simplemente todos los endpoints que tocan la base devuelven 500
 * sin explicación, mientras la misma base responde perfecto desde local. Es muy fácil
 * pasar horas buscando un bug de código que no existe.
 */

const ORIGINAL = process.env.DATABASE_URL;

/** Contraseña con caracteres que exigen escapado, como las de Supabase. */
const PASSWORD = "p@ssw0rd/+_con=caracteres&raros";
const BASE = `postgresql://postgres.abc123:${PASSWORD}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;

describe("urlDeConexion", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = BASE;
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL;
  });

  it("falla ruidosamente si DATABASE_URL no está definida", () => {
    delete process.env.DATABASE_URL;
    // Sin esto, el error recién aparecería en la primera query y parecería un bug de
    // autenticación en vez de una variable de entorno faltante.
    expect(() => urlDeConexion()).toThrow(/DATABASE_URL/);
  });

  it("limita el pool a una conexión cuando la URL no dice nada", () => {
    expect(urlDeConexion()).toBe(`${BASE}?connection_limit=1`);
  });

  it("agrega el parámetro con & si ya hay otros en la query", () => {
    process.env.DATABASE_URL = `${BASE}?sslmode=require`;
    expect(urlDeConexion()).toBe(`${BASE}?sslmode=require&connection_limit=1`);
  });

  it("respeta un connection_limit que alguien configuró a mano", () => {
    // El panel de Vercel gana: si alguien lo puso explícito, no se lo pisamos.
    process.env.DATABASE_URL = `${BASE}?connection_limit=3`;
    expect(urlDeConexion()).toBe(`${BASE}?connection_limit=3`);
  });

  it("no toca las credenciales al agregarle el parámetro", () => {
    // El riesgo real de usar new URL(): el parser normaliza y re-escapa el usuario y la
    // contraseña, y un escapado distinto rompe la autenticación contra el pooler.
    // Lo que importa es que TODO lo anterior al '?' quede idéntico, credenciales incluidas.
    const url = urlDeConexion();
    expect(url.slice(0, url.indexOf("?"))).toBe(BASE);
    expect(url).toContain(PASSWORD);
  });

  it("deja intacta una URL que ya viene con sslmode y connection_limit de Supabase", () => {
    const url =
      "postgresql://postgres.abc:clave@aws-0-eu-west-1.pooler.supabase.com:6543/postgres" +
      "?sslmode=require&pgbouncer=true&connection_limit=1";
    process.env.DATABASE_URL = url;
    expect(urlDeConexion()).toBe(url);
  });
});
