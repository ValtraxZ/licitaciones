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
prisma/schema.prisma      modelo de datos (6 entidades + auditoría)
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
src/app/api/**/route.ts   endpoints
src/app/api/cron/         job programado
src/proxy.ts              protección de rutas
```

## Estado actual

Proyecto: Supabase `bdexhlcebqhrgwhgppdn`, región declarada **us-west-2**, PostgreSQL 14.18,
activo (la secret key responde 200 en `/rest/v1/`).

- [x] Proyecto Next.js 16.4.0 creado, dependencias instaladas
- [x] `next.config.ts` con `cacheComponents: false` documentado
- [x] `prisma/schema.prisma` completo (6 entidades, auditoría, índices)
- [x] `prisma.config.ts` + `.env` + `.env.example` + `.gitignore` corregido
- [x] `src/lib/db.ts` singleton, `prisma/seed.ts`
- [x] Claves de Supabase cargadas (`sb_publishable_` / `sb_secret_`) y verificadas
- [ ] **BLOQUEADO: `DATABASE_URL` / `DIRECT_URL`.** Ver abajo.
- [ ] `src/lib/estados.ts`, `transiciones.ts`, `reglas.ts`
- [ ] Auth (`session.ts`, `proxy.ts`, login)
- [ ] CRUD clientes/productos/usuarios
- [ ] Licitaciones + productos + presupuesto
- [ ] Storage + envío con email
- [ ] Pagos + cron
- [ ] UI + deploy + README

### Diagnóstico de la base de datos (resuelto, documentado en `.env`)

- La conexión **directa** `db.<ref>.supabase.co` resuelve **solo a IPv6** (AAAA) y esta máquina
  **no tiene ruta IPv6 a Internet** (`Get-NetRoute -AddressFamily IPv6 ::/0` vacío) → `P1001`
  siempre. Inusable en local. Imposible arreglar desde el código.
- El **pooler** `aws-0-<region>.pooler.supabase.com` resuelve a IPv4 y el puerto 5432 responde,
  pero este proyecto usa el pooler **nuevo**: con `postgres.<ref>` responde
  `tenant/user not found` y con `postgres` responde
  `no tenant identifier provided (external_id or sni_hostname required)`.
  Se barrieron las 19 regiones de Supabase con reintentos y ninguna acepta esos dos formatos.
- **Acción pendiente del usuario:** copiar la cadena de la pestaña **"Session pooler"** del
  dashboard (Supabase → Project Settings → Database → Connection string), con la contraseña puesta.
- Barato de reintentar si vuelve a fallar: `npx prisma db push` con la variable ya cargada.


## Notas de seguridad

- La contraseña de la base aparece en este chat. **Rotarla antes de publicar el repo.**
- `.env` está en `.gitignore`; `.env.example` sí va commiteado.
- `SUPABASE_SERVICE_ROLE_KEY` nunca con `NEXT_PUBLIC_`.
