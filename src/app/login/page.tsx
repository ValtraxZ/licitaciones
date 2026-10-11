import { Suspense } from "react";
import { LoginForm } from "./login-form";

/**
 * Página de login.
 *
 * Se parte en dos porque `LoginForm` usa `useSearchParams()`: en App Router eso obliga
 * a envolverlo en `<Suspense>` para que la página pueda prerenderizarse. Sin el
 * boundary, el build falla con "useSearchParams() should be wrapped in a suspense boundary".
 */
export const metadata = { title: "Iniciar sesión — Licitaciones" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
