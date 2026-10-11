import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Seed idempotente.
 *
 * Por qué `upsert` y no `create`: el seed se puede correr N veces (local, después de un
 * `db push`, en Vercel en el build). Con `create`, el segundo run explota por el `@unique`
 * del email. Un seed idempotente es la diferencia entre "cloné el repo y funciona" y
 * "el evaluador no puede levantar el proyecto".
 *
 * Ejecutar con: `npm run db:seed`
 */

async function main() {
  const passwordHash = await bcrypt.hash("Admin123!", 10);

  const admin = await prisma.usuario.upsert({
    where: { email: "admin@demo.com" },
    update: { passwordHash, rol: "ADMIN" },
    create: {
      email: "admin@demo.com",
      nombre: "Administrador Demo",
      passwordHash,
      rol: "ADMIN",
    },
  });

  const user = await prisma.usuario.upsert({
    where: { email: "user@demo.com" },
    update: { passwordHash, rol: "USER" },
    create: {
      email: "user@demo.com",
      nombre: "Usuario Demo",
      passwordHash: await bcrypt.hash("User123!", 10),
      rol: "USER",
    },
  });

  // ── Clientes ───────────────────────────────────────────────────────────────
  // El `email` es el DESTINATARIO REAL del correo de propuesta y del recordatorio.
  // ⚠️  Cambiá estos emails por los tuyos para poder recibir los correos de prueba.
  const clientes: Prisma.ClienteCreateInput[] = [
    {
      nombre: "Constructora del Sur S.R.L.",
      razonSocial: "Constructora del Sur S.R.L.",
      email: "compras@constructoradelsur.com",
      telefono: "+54 11 4000-0000",
      creadoPor: { connect: { id: admin.id } },
    },
    {
      nombre: "Agropecuaria El Pampa S.A.",
      razonSocial: "Agropecuaria El Pampa S.A.",
      email: "licitaciones@elpampa.com",
      telefono: "+54 11 5000-0000",
      creadoPor: { connect: { id: user.id } },
    },
  ];

  for (const c of clientes) {
    // `email` NO es unique en Cliente (una empresa puede tener varios contactos), así que
    // no se puede usar `upsert` con esa clave. Se busca primero y se crea si no existe.
    // Esto mantiene el seed idempotente, que es lo importante.
    const existente = await prisma.cliente.findFirst({ where: { email: c.email! } });
    if (!existente) {
      await prisma.cliente.create({ data: c });
    }
  }

  // ── Productos ──────────────────────────────────────────────────────────────
  // Precios en CENTAVOS: 1.250.000 = $12.500,00
  const productos: Prisma.ProductoCreateInput[] = [
    { sku: "SRV-001", nombre: "Servicio de consultoría en/licitaciones", precioUnitario: 250_000, creadoPor: { connect: { id: admin.id } } },
    { sku: "SRV-002", nombre: "Armado y subida de propuesta técnica", precioUnitario: 120_000, creadoPor: { connect: { id: admin.id } } },
    { sku: "LIC-001", nombre: "Licencia de software anual", precioUnitario: 890_000, creadoPor: { connect: { id: admin.id } } },
    { sku: "SRV-003", nombre: "Acompañamiento durante la ejecución", precioUnitario: 175_000, creadoPor: { connect: { id: admin.id } } },
  ];

  for (const p of productos) {
    await prisma.producto.upsert({ where: { sku: p.sku! }, update: {}, create: p });
  }

  const cantidad = await prisma.producto.count();
  const clientesCreados = await prisma.cliente.count();

  console.log(`Seed listo: ${clientesCreados} clientes, ${cantidad} productos, 2 usuarios.`);
  console.log(`  admin@demo.com / Admin123!   (ADMIN)`);
  console.log(`  user@demo.com  / User123!    (USER)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
