import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserPagina } from "@/lib/session";
import { Cabecera, NavegacionMovil, TituloPagina } from "@/components/cabecera";
import { EstadoRol } from "@/components/estado-badge";
import { NuevoUsuario } from "./nuevo-usuario";
import { btnPrimario, input, panel } from "@/lib/ui";

export const metadata = { title: "Usuarios — Licitaciones" };
export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const sesion = await requireUserPagina();

  /**
   * Guarda de página: si no es admin, se lo manda al panel.
   *
   * ANTES esto lanzaba un error y Next mostraba la pantalla de error genérica. Un 403 en
   * una navegación es un caso esperado, no una excepción: lo correcto es redirigir.
   *
   * La condición sigue además en POST /api/usuarios, que es la que valida de verdad: un
   * endpoint se puede llamar directo con fetch, sin pasar por esta página.
   */
  if (sesion.rol !== "ADMIN") {
    redirect("/dashboard");
  }

  const usuarios = await prisma.usuario.findMany({
    // `select` explícito: el passwordHash nunca sale del servidor, ni por descuido.
    select: {
      id: true,
      email: true,
      nombre: true,
      rol: true,
      activo: true,
      creadoEn: true,
      _count: { select: { licitacionesCreadas: true, pagosRegistrados: true } },
    },
    orderBy: [{ rol: "desc" }, { nombre: "asc" }],
  });

  const admins = usuarios.filter((u) => u.rol === "ADMIN").length;

  return (
    <main className="min-h-screen">
      <Cabecera
        titulo="Usuarios"
        usuario={sesion.nombre}
        rol={sesion.rol}
        activa="/usuarios"
      />
      <NavegacionMovil activa="/usuarios" />

      <div className="mx-auto max-w-6xl px-6 pb-16">
        <TituloPagina
          titulo="Usuarios"
          descripcion={`${usuarios.length} cuentas · ${admins} administrador${admins === 1 ? "" : "es"} · solo un ADMIN puede crear usuarios`}
        />

        <NuevoUsuario />

        <div className={`${panel} mt-4 overflow-hidden`}>
          <table className="min-w-full text-sm">
            <thead className="bg-tierra-50 text-left text-xs uppercase tracking-wide text-tierra-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 text-right font-medium">Licitaciones</th>
                <th className="px-4 py-3 text-right font-medium">Pagos</th>
                <th className="px-4 py-3 font-medium">Alta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tierra-100">
              {usuarios.map((u) => (
                <tr key={u.id} className="hover:bg-tierra-50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-tierra-900">{u.nombre}</span>
                    {!u.activo && (
                      <span className="ml-2 rounded bg-tierra-200 px-1.5 py-0.5 text-[10px] text-tierra-700">
                        inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-tierra-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <EstadoRol rol={u.rol} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-tierra-600">
                    {u._count.licitacionesCreadas}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-tierra-600">
                    {u._count.pagosRegistrados}
                  </td>
                  <td className="px-4 py-3 text-xs text-tierra-500">
                    {u.creadoEn.toLocaleDateString("es-AR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-tierra-500">
          El hash de la contraseña nunca se envía al navegador: la consulta usa <code>select</code>{" "}
          explícito, así que no hay forma de filtrarlo por descuido.
        </p>
      </div>
    </main>
  );
}
