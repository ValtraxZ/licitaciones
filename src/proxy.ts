import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, verificarToken } from "@/lib/token";

/**
 * PROTECCIÓN DE RUTAS
 * ===================
 * En Next.js 16 esto se llama `proxy.ts` (antes `middleware.ts`, que quedó deprecado)
 * y la función exportada se llama `proxy` (antes `middleware`). Corre en runtime Node.
 *
 * QUÉ HACE Y QUÉ NO HACE
 * ----------------------
 * El proxy VERIFICA el JWT, no solo mira que exista la cookie. Un `req.cookies.has()`
 * solamente no impediría navegar con una cookie basura.
 *
 * PERO NO es la frontera de seguridad. Es una optimización de UX: evita renderizar
 * páginas que van a redirigir. La autorización real está en cada endpoint, con
 * `requireUser()` / `requireAdmin()`. Si mañana exponés una API sin página, el proxy
 * no la cubre. Defensa en profundidad: dos capas, cada una con su responsabilidad.
 */

const RUTAS_PROTEGIDAS = ["/dashboard", "/licitaciones", "/clientes", "/productos", "/usuarios"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const esLogin = pathname === "/login";

  const sesion = await verificarToken(req.cookies.get(COOKIE_SESION)?.value);

  // Ya logueado y quiere ir al login → mandarlo al panel.
  if (sesion && esLogin) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Sin sesión y en una ruta protegida → login, recordando a dónde quería ir.
  if (!sesion && RUTAS_PROTEGIDAS.some((r) => pathname.startsWith(r))) {
    const destino = encodeURIComponent(pathname);
    return NextResponse.redirect(new URL(`/login?next=${destino}`, req.url));
  }

  /**
   * `/usuarios` es la única ruta con rol requerido.
   *
   * El chequeo va AQUÍ y no dentro de la página por una razón concreta: la página usa
   * `loading.tsx`, así que se renderiza en streaming y el status HTTP ya salió como 200
   * antes de que la página pudiera llamar a `redirect()`. El redirect terminaba
   * resoliéndose en el cliente, sin código de estado de redirección.
   *
   * En el proxy el chequeo ocurre ANTES de renderizar, así que el 307 es real. Además
   * ahorra la consulta a la base: un usuario sin permiso nunca llega a consultar nada.
   *
   * La autorización que manda sigue siendo la del endpoint: `requireAdmin()` en
   * POST /api/usuarios. Esta es la primera capa, no la única.
   */
  if (sesion && sesion.rol !== "ADMIN" && pathname.startsWith("/usuarios")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  /**
   * El matcher es lo que evita que este código corra en CADA request: sin él, cada
   * imagen, cada CSS y cada chunk de JS paga el costo de verificar un JWT.
   *
   * Solo se matchean las rutas que necesitan chequeo. `/api/**` queda fuera a
   * propósito: los endpoints se autentican con `requireUser()` dentro del handler, que
   * devuelve 401 JSON en vez de un redirect HTML (un fetch que recibe un redirect a
   * /login no sabe qué mostrar).
   */
  matcher: ["/login", "/dashboard/:path*", "/licitaciones/:path*", "/clientes/:path*", "/productos/:path*", "/usuarios/:path*"],
};
