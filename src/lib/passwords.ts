import bcrypt from "bcryptjs";

/**
 * Hash de contraseñas con bcrypt.
 *
 * Por qué bcrypt y no un hash simple (sha256): bcrypt es LENTO a propósito. Con
 * `rounds = 10` cada comparación tarda ~100 ms. Eso encarece tanto un login masivo
 * como un ataque de fuerza bruta: si el atacante prueba 100 millones de contraseñas
 * contra una base robada, necesita años en vez de horas.
 *
 * Nunca se guarda el password en plano ni se manda al cliente.
 * `passwordHash` es `String` (no `String?`): un usuario sin hash no puede autenticarse,
 * así que no tiene sentido modelarlo como opcional.
 */

export const ROLES = ["ADMIN", "USER"] as const;
export type Rol = (typeof ROLES)[number];

export function hashPassword(plano: string): Promise<string> {
  return bcrypt.hash(plano, 10);
}

export function verifyPassword(plano: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plano, hash);
}
