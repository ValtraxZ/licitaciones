import Link from "next/link";
import { prisma } from "@/lib/db";
import { errores } from "@/lib/errores";
import { requireUserPagina } from "@/lib/session";
import { NuevoUsuario } from "./nuevo-usuario";

export const metadata = { title: "Usuarios" };
export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const sesion = await requireUserPagina();

  // Guarda de página además de la del endpoint. El requisito es que solo un ADMIN
  // puede crear usuarios, y esa condición tiene que chequearse en los DOS lados:
  // acá para no renderizar el formulario, y en POST /api/usuarios para no aceptarlo
  // aunque alguien llame la API directo con fetch.
  if (sesion.rol !== "ADMIN") {
    throw errores.soloAdmin("La gestión de usuarios es solo para administradores");
  }

  const usuarios = await prisma.usuario.findMany({
    // `select` explícito: el passwordHash nunca sale del servidor, ni por descuido.
    select: {
      id: true, email: true, nombre: true, rol: true, activo: true,
      creadoEn: true,
      _count: { select: { licitacionesCreadas: true, pagosRegistrados: true } },
    },
    orderBy: { nombre: "asc" },
  });

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Usuarios</h1>
          <p className="text-sm text-slate-500">
            {usuarios.length} usuarios · solo un administrador puede crear cuentas
          </p>
        </div>
        <Link href="/dashboard" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          Volver al panel
        </Link>
      </header>

      <NuevoUsuario />

      <div className="mt-6 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 text-right font-medium">Licitaciones</th>
              <th className="px-4 py-3 text-right font-medium">Pagos</th>
              <th className="px-4 py-3 font-medium">Alta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {usuarios.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{u.nombre}</td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      u.rol === "ADMIN"
                        ? "bg-purple-50 text-purple-700 ring-purple-200"
                        : "bg-slate-100 text-slate-600 ring-slate-200"
                    }`}
                  >
                    {u.rol}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {u._count.licitacionesCreadas}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {u._count.pagosRegistrados}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {u.creadoEn.toLocaleDateString("es-AR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
