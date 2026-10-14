import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conReintentos, esErrorTransitorio, urlDeConexion } from "../db";

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

/** Error de Prisma con un código, como los que lanza el cliente real. */
function errorPrisma(code: string) {
  const e = new Error(`error simulado ${code}`);
  (e as Error & { code: string }).code = code;
  return e;
}

/** Error de inicialización del cliente, que no trae `code` sino otro nombre de clase. */
class PrismaClientInitializationError extends Error {}

describe("esErrorTransitorio", () => {
  it("reconoce los códigos que son de conexión", () => {
    for (const codigo of ["P1001", "P1002", "P1008", "P1017", "P2024", "P2028"]) {
      expect(esErrorTransitorio(errorPrisma(codigo))).toBe(true);
    }
  });

  it("NO reintenta errores de datos, que no se arreglan solos", () => {
    // P2002 es "unique constraint violated": la respuesta es definitiva. Reintentarlo
    // convertiría un 409 correcto en un 500 y tardaría más en decir que no.
    expect(esErrorTransitorio(errorPrisma("P2002"))).toBe(false);
    // P2025 es "record not found" y P2003 es violate de foreign key.
    expect(esErrorTransitorio(errorPrisma("P2025"))).toBe(false);
    expect(esErrorTransitorio(errorPrisma("P2003"))).toBe(false);
  });

  it("reconoce los fallos de inicialización aunque no tengan código", () => {
    expect(esErrorTransitorio(new PrismaClientInitializationError("no conecta"))).toBe(true);
  });

  it("no confunde los errores de negocio del proyecto con los de Prisma", () => {
    // ErrorNegocio es lo que lanzan las reglas de negocio: jamás debe reintentarse.
    expect(esErrorTransitorio(new ErrorNegocioPrueba())).toBe(false);
    expect(esErrorTransitorio(new Error("algo falló"))).toBe(false);
    expect(esErrorTransitorio(null)).toBe(false);
    expect(esErrorTransitorio(undefined)).toBe(false);
  });
});

class ErrorNegocioPrueba extends Error {
  code = "PRESUPUESTO_EXCEDIDO";
}

describe("conReintentos", () => {
  it("devuelve el resultado si la operación funciona a la primera", async () => {
    const op = vi.fn().mockResolvedValue("ok");
    await expect(conReintentos(op)).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("reintenta y tiene éxito si el fallo fue de conexión", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(errorPrisma("P1001"))
      .mockRejectedValueOnce(errorPrisma("P1001"))
      .mockResolvedValue("ok");
    await expect(conReintentos(op)).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("propaga el error de datos sin reintentar ni una vez", async () => {
    const error = errorPrisma("P2002");
    const op = vi.fn().mockRejectedValue(error);
    await expect(conReintentos(op)).rejects.toBe(error);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("se rinde después de varios intentos y propaga el último error", async () => {
    const op = vi.fn().mockRejectedValue(errorPrisma("P1001"));
    await expect(conReintentos(op)).rejects.toThrow(/P1001/);
    expect(op.mock.calls.length).toBeGreaterThan(1);
  });
});
