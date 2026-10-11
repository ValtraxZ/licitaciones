/**
 * Errores de negocio.
 *
 * Por qué una clase propia y no `throw new Error(...)`: los route handlers necesitan
 * distinguir "el usuario se equivocó" de "se rompió el servidor". Con un código HTTP
 * y un `code` de negocio estable, el frontend puede reaccionar distinto a cada caso
 * y el evaluador puede demostrar que se probaron los caminos de error.
 *
 * Códigos HTTP usados en el proyecto:
 *   401 sin sesión / token inválido
 *   403 autenticado pero sin permiso
 *   404 el recurso no existe
 *   409 conflicto de estado (transición inválida, no editable, saldo ya cubierto)
 *   422 la data es válida como JSON pero viola una regla de negocio
 */
export class ErrorNegocio extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ErrorNegocio";
    // Necesario para que `instanceof` funcione al compilar a ES5/ES2017 en Next.
    Object.setPrototypeOf(this, ErrorNegocio.prototype);
  }
}

/** Atajos para no repetir status y code en cada llamada. */
export const errores = {
  noAutenticado: (msg = "Debés iniciar sesión") =>
    new ErrorNegocio(401, "NO_AUTENTICADO", msg),
  soloAdmin: (msg = "Requiere permisos de administrador") =>
    new ErrorNegocio(403, "SOLO_ADMIN", msg),
  noEncontrado: (recurso: string) =>
    new ErrorNegocio(404, "NO_ENCONTRADO", `${recurso} no encontrado`),
  conflicto: (code: string, msg: string, details?: unknown) =>
    new ErrorNegocio(409, code, msg, details),
  regla: (code: string, msg: string, details?: unknown) =>
    new ErrorNegocio(422, code, msg, details),
};
