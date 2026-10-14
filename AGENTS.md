# AGENTS.md — Sistema de Gestión de Licitaciones

> Contexto persistente del proyecto. OpenCode lo lee en cada sesión.
> Si cambiás una decisión de acá, actualizá este archivo primero.

## Qué es esto

API + panel web para administrar licitaciones comerciales: se redacta una licitación,
se le adjunta una propuesta, se envía formalmente al cliente por email, se le hace
seguimiento hasta la fecha límite, se resuelve (ganada/perdida) y si se ganó se factura
y cobra hasta saldar. Todo auditado paso a paso.

Prueba técnica para puesto Jr/Mid. Los evaluadores miran: modelo de datos, reglas de
negocio, código, documentación, deploy, e integración real de email con adjuntos.

## Stack (decidido, no cambiar sin motivo)

| Capa | Elección | Por qué |
|---|---|---|
| Framework | Next.js **16.4.0** App Router + TypeScript | Full-stack en un repo: API + UI + cron |
| DB | **Supabase PostgreSQL** | El enunciado lo permite; la máquina del dev no tiene Docker |
| ORM | **Prisma 6.19.3** | Migraciones + tipos |
| Auth | **JWT en cookie httpOnly con `jose`** | 40 líneas explicables, sin beta de librerías |
| Email | **Resend** | Adjuntos reales vía `attachments`, plan free |
| Storage | **Supabase Storage** bucket `propuestas` | URL real = evidencia del enunciado |
| Cron | Endpoint HTTP `/api/cron/licitaciones` | El transporte (Vercel Cron / GitHub Actions) es intercambiable |
| Tests | Vitest 3 | Para la máquina de estados y el cálculo de saldo |

## Restricciones del entorno

- Node **22.14.0** en Windows. Sin Docker, sin Python.
- `db.<ref>.supabase.co` resuelve **solo a IPv6 (AAAA)** y esta máquina no tiene salida
  IPv6 → **conexión directa falla con P1001**. Hay que usar el **pooler**
  (`aws-0-<region>.pooler.supabase.com`), que resuelve a IPv4. Esto aplica tanto a local
  como a Vercel, así que `DATABASE_URL` debe ser la del pooler.
- npm 11.21 bloquea install scripts: hay que `npm install-scripts approve <pkg>`.
  Ya están aprobados en `package.json` (`allowScripts`).
- Next 16: `middleware.ts` está deprecado → usar **`src/proxy.ts`** con `export function proxy()`.
- Next 16: `cookies()` y `params` son **async** (el acceso síncrono fue eliminado).
- Next 16: `export const dynamic = 'force-dynamic'` sigue funcionando solo si
  `cacheComponents: false`. Está en false a propósito (ver `next.config.ts`).
- **Vercel + pooler ⇒ `connection_limit=1` + reintentos.** Vercel corre varias instancias
  de serverless a la vez. Con `connection_limit=5` cada una abre 5 conexiones y se agota
  el pool de Supabase: no avisa, solo corta, y el síntoma es que **todo endpoint que toca
  la base devuelve 500** mientras los que no la tocan responden 200. Se confunde con un bug
  de sesión o de deploy. `src/lib/db.ts` pone `connection_limit=1` si falta y reintenta
  solo errores de CONEXIÓN (nunca de datos: un `P2002` es respuesta definitiva).
  NO volver a 5.
- **El pooler de este proyecto admite ~4 conexiones.** Consecuencia: la app aguanta ~10
  requests simultáneas contra la base; por encima de ~20 hay rechazos. Es el techo del
  pooler, no un bug. Arreglo de fondo: modo transaction de Supabase (puerto **6543** +
  `pgbouncer=true` en `DATABASE_URL` de Vercel). Para medir:
  `npx tsx --env-file=.env scripts/prueba-carga.ts`.
- **Para diagnosticar "todo da 500"**: compará un endpoint que toca la base contra uno que
  no (`/api/openapi`, `/api/auth/me`). Si solo cae el primero, es la conexión.

## Reglas innegociables del dominio

1. **Montos SIEMPRE en enteros (centavos).** Nunca float: `0.1 + 0.2 !== 0.3`.
2. **El estado de una licitación SOLO se modifica dentro de `cambiarEstado()`**
   (`src/lib/transiciones.ts`). Nunca un `update` directo.
3. **Toda transición escribe historial.** Automáticas con `usuarioId: null` y
   `origen: 'automatica' | 'sistema'`.
4. **Tabla de transiciones** (única fuente de verdad, `src/lib/estados.ts`):
   `borrador→activa`, `activa→finalizada|perdida`, `finalizada→por_cobrar`,
   `por_cobrar→cobrada`. `cobrada` y `perdida` son terminales.
5. **Solo `borrador` y `activa` permiten agregar/quitar productos.**
6. **El total de productos nunca supera `presupuestoMaximo`** → 422.
7. **No se puede enviar sin `documentoUrl`** → 422.
8. **Pagos solo en `por_cobrar`**, y el monto nunca supera
   `montoFacturado - suma(pagos)`. Al llegar a cero → `cobrada` automático.
9. **`por_cobrar → cobrada` no es un endpoint.** Se dispara sola. No exponerlo.
10. **El email va FUERA de la transacción de DB.** Primero transición, después correo.

## Convenciones de código

- **Cero lógica de negocio en los route handlers.** Validan input, llaman a `src/lib/`,
  y traduzen excepciones con `responderError()`.
- Errores: `new ErrorNegocio(status, code, message)`. Formato de respuesta:
  `{ error: { code, message, details? } }`.
  - 401 sin sesión · 403 sin permiso · 404 no existe · 409 conflicto de estado · 422 regla de negocio
- **Todo lo que muta datosseveral filas va en `prisma.$transaction`.**
- Los role handlers usan `params: Promise<{ id: string }>` y hacen `await params`.
- Español en UI, nombres de dominio, comentarios y mensajes de commit.
- Antes de editar un archivo, leerlo completo.
- Al agregar un campo de auditoría, agregar la relación `SetNull` en ambos lados.

## Estructura

```
prisma/schema.prisma      modelo de datos (7 entidades + auditoría)
prisma/seed.ts            seed idempotente con upsert
src/lib/estados.ts        ← MÁQUINA DE ESTADOS
src/lib/transiciones.ts   ← cambiarEstado(): único lugar que toca `estado`
src/lib/reglas.ts         ← presupuesto, saldo, documento, editabilidad
src/lib/db.ts             PrismaClient singleton
src/lib/session.ts        JWT + requireUser/requireAdmin
src/lib/errores.ts        ErrorNegocio + responderError
src/lib/validators.ts     schemas de Zod
src/lib/storage.ts        Supabase Storage
src/lib/email/            Resend + plantillas
src/lib/pdf/propuesta.ts  genera la propuesta en PDF (pdfkit)
src/lib/openapi.ts        spec OpenAPI en código (no YAML: no puede quedar viejo)
src/app/api/**/route.ts   endpoints
src/app/api/cron/         job programado
src/app/api-docs/         Swagger UI (pública, sin sesión)
src/proxy.ts              protección de rutas
```

## Estado actual

Proyecto: Supabase `bdexhlcebqhrgwhgppdn`, **región us-west-2, pooler `aws-1-us-west-2`**,
PostgreSQL 17.11. **CONEXIÓN RESUELTA** ✅

- [x] Proyecto Next.js 16.4.0 + TypeScript + Prisma 6.19
- [x] `next.config.ts` con `cacheComponents: false` documentado
- [x] `prisma/schema.prisma` completo (7 entidades, auditoría, índices)
- [x] `prisma.config.ts` + `.env` + `.env.example` + `.gitignore`
- [x] `src/lib/db.ts` singleton, `prisma/seed.ts` (idempotente)
- [x] Claves de Supabase y pooler cargadas
- [x] **`prisma db push` aplicado + seed corrido** (2 clientes, 4 productos, 2 usuarios)
- [x] Núcleo de reglas de negocio: `estados.ts`, `reglas.ts`, `transiciones.ts`,
      `licitaciones/productos.ts`, `licitaciones/pagos.ts` — **52 tests pasando**
- [x] **Auth completa**: `token.ts`, `session.ts`, `passwords.ts`, `proxy.ts`,
      `api/auth/{login,logout,me}` — verificada end-to-end
- [x] CRUD clientes / productos / usuarios (solo admin crea usuarios)
- [x] Endpoints de licitaciones (crear, detalle, productos, enviar, resolver, facturar, pagos)
- [x] Storage + envío con email real y adjunto
- [x] Job programado (vencimiento + recordatorio)
- [x] UI + deploy + README + evidencia
- [x] Documentación OpenAPI: `src/lib/openapi.ts` + `/api-docs` + `/api/openapi`

### Trampa del pooler de Supabase (no volver a picar)

El host del pooler es **`aws-1-us-west-2.pooler.supabase.com`**. El prefijo es `aws-1`,
NO `aws-0`. Ese `aws-1` es específico del proyecto y **no se puede adivinar**: con `aws-0`
el pooler responde `tenant/user <ref> not found` aunque usuario, contraseña y región sean
correctos. La región sola tampoco alcanza: hay que copiar la cadena del dashboard
(Supabase → Project Settings → Database → Connection string).

Además: la conexión directa `db.<ref>.supabase.co` es **inusable en local** (solo IPv6, y
esta máquina no tiene ruta IPv6 a Internet). `DIRECT_URL` también apunta al pooler por eso.

### Verificado end-to-end

| Prueba | Resultado |
|---|---|
| login password incorrecta | 401 `NO_AUTENTICADO` |
| login email inexistente | 401, **mensaje idéntico** (no enumera usuarios) |
| login admin correcto | 200 + cookie httpOnly |
| `/api/auth/me` con sesión | 200 con rol |
| `/api/auth/me` sin sesión | 200 `data: null` |
| `/dashboard` sin sesión | 307 → `/login?next=%2Fdashboard` |
| `/licitaciones` sin sesión | 307 → `/login?next=%2Flicitaciones` |
| `/dashboard` con cookie válida | 200, muestra nombre y rol |
| `/dashboard` con cookie falsificada | 307 → login (la firma se verifica) |

### Cuentas de prueba

`admin@demo.com / Admin123!` (ADMIN) · `user@demo.com / User123!` (USER)

### Diagnóstico de la base de datos (RESUELTO)

Ver la sección "Trampa del pooler" más abajo. `DATABASE_URL` y `DIRECT_URL` ya funcionan
y apuntan a `aws-1-us-west-2.pooler.supabase.com`.


## Notas de seguridad

- La contraseña de la base aparece en este chat. **Rotarla antes de publicar el repo.**
- `.env` está en `.gitignore`; `.env.example` sí va commiteado.
- `SUPABASE_SERVICE_ROLE_KEY` nunca con `NEXT_PUBLIC_`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
