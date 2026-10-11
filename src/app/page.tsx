import { redirect } from "next/navigation";

/**
 * Raíz del sitio: manda al panel.
 *
 * No decide a dónde según la sesión porque el `proxy.ts` ya se encarga: si no hay
 * cookie válida redirige a `/login`, y si la hay, `/dashboard` muestra el panel. Un
 * chequeo de sesión repetido acá sería una segunda implementación de la misma regla.
 */
export default function Home() {
  redirect("/dashboard");
}
