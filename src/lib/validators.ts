import { z } from "zod";

/**
 * Schemas de validación de entrada (Zod).
 *
 * POR QUÉ VALIDAR EN EL BORDE Y NO EN CADA CAPA
 * ---------------------------------------------
 * La validación vive en los route handlers, una sola vez, contra un schema. A partir de
 * ahí el resto del código trabaja con datos tipados y no vuelve a chequear. Si el schema
 * está mal, TypeScript avisa al compilar.
 *
 * `.int()` en los montos es la primera línea de defensa contra el error de punto
 * flotante: rechaza `12.55` antes de que llegue a la base.
 */

// ─────────────────────────── Auth ───────────────────────────

export const LoginSchema = z.object({
  email: z.email("Debe ser un email válido").trim().toLowerCase(),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

export const CrearUsuarioSchema = z.object({
  email: z.email("Debe ser un email válido").trim().toLowerCase(),
  nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(120),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
  rol: z.enum(["ADMIN", "USER"]).default("USER"),
});

// ─────────────────────────── Clientes ───────────────────────────

export const ClienteSchema = z.object({
  nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(120),
  razonSocial: z.string().trim().max(200).optional(),
  email: z.email("Debe ser un email válido").trim().toLowerCase(),
  telefono: z.string().trim().max(40).optional(),
});

// ─────────────────────────── Productos ───────────────────────────

export const ProductoSchema = z.object({
  sku: z.string().trim().min(2, "Mínimo 2 caracteres").max(40),
  nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(160),
  descripcion: z.string().trim().max(1000).optional(),
  precioUnitario: z
    .int("El precio debe ser un entero en centavos, no un decimal")
    .nonnegative("El precio no puede ser negativo"),
});

// ─────────────────────────── Licitaciones ───────────────────────────

export const LicitacionSchema = z.object({
  titulo: z.string().trim().min(3, "Mínimo 3 caracteres").max(200),
  descripcion: z.string().trim().max(2000).optional(),
  clienteId: z.string().min(1, "Falta el cliente"),
  presupuestoMaximo: z.int("El presupuesto debe ser un entero en centavos").positive(),
  // `z.coerce.date()` acepta el string ISO del fetch y lo convierte a Date, sin
  // try/catch manual en el route handler.
  fechaLimite: z.coerce.date(),
});

export const ItemProductoSchema = z.object({
  productoId: z.string().min(1),
  cantidad: z.int().positive("La cantidad debe ser mayor a cero"),
  precioUnitario: z.int().nonnegative(),
});

export const PagoSchema = z.object({
  monto: z.int("El monto debe ser un entero en centavos").positive(),
  metodo: z.enum(["transferencia", "efectivo", "tarjeta", "otro"]),
  referencia: z.string().trim().max(120).optional(),
  notas: z.string().trim().max(500).optional(),
  fechaPago: z.coerce.date().optional(),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type ClienteInput = z.infer<typeof ClienteSchema>;
export type ProductoInput = z.infer<typeof ProductoSchema>;
export type LicitacionInput = z.infer<typeof LicitacionSchema>;
export type ItemProductoInput = z.infer<typeof ItemProductoSchema>;
export type PagoInput = z.infer<typeof PagoSchema>;
