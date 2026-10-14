# Guía de despliegue

Los cinco entregables del enunciado y exactamente qué hacer para cada uno.
Lo que ya está hecho y lo que depende de vos están marcados.

---

## Entregable 1 — Repositorio Git público ✅ código listo

**Estado:** 17 commits, `.env` correctamente ignorado, cero secretos en el repo.

### Pasos

1. Entrá a <https://github.com> (creá cuenta si no la tenés).
2. Botón **`+`** arriba a la derecha → **New repository**.
3. Nombre: `licitaciones`.
4. **No marques ninguna casilla** de "Initialize this repository".
5. **Create repository**.
6. Abrí la terminal **dentro de** `C:\Users\andre\Documents\Proyecto predeterminado\licitaciones`
   y corré los comandos que te muestra GitHub. Son estos:

```bash
git remote add origin https://github.com/TU_USUARIO/licitaciones.git
git branch -M main
git push -u origin main
```

> **Si pide usuario y contraseña:** la contraseña **no es tu cuenta de GitHub**.
> Usá un *Personal access token*: Settings → Developer settings → Personal access
> tokens → Tokens (classic) → Generate new token → tildá `repo` → copialo
> (solo se muestra una vez).

### Verificar

<https://github.com/TU_USUARIO/licitaciones> debe mostrar el código.
**Debe verse `README.md` renderizado abajo.**

---

## Entregable 2 — README con instrucciones ✅ ya escrito

**Está listo.** El `README.md` tiene: qué hace, stack con el porqué, instalación en
5 comandos, tabla de variables de entorno, tabla de requisitos → implementación →
cómo verificarlo, decisiones de diseño, y comandos de prueba.

**Solo agregale al final el enlace de tu deploy** (cuando lo tengas):

```markdown
## Demo en producción

<https://licitaciones.vercel.app>

| Rol | Usuario | Contraseña |
|---|---|---|
| ADMIN | admin@demo.com | Admin123! |
| USER | user@demo.com | User123! |
```

---

## Entregable 3 — Despliegue en servicio gratuito ✅ hecho

> **Deploy funcionando:** https://licitaciones-mu-sepia.vercel.app
> **Job programado:** verificado contra producción (ver `EVIDENCIAS.md`, sección 3).

### Antes de empezar: rotar la contraseña de la base

> La contraseña de la base de desarrollo quedó expuesta en un canal de comunicación
> durante el desarrollo. **Rotala antes de publicar.**

1. Supabase → **Settings** → **Database** → **Reset database password**
2. Anotá la nueva
3. Actualizá `DATABASE_URL` y `DIRECT_URL` en tu archivo `.env` (las dos)

### Desplegar en Vercel

**Opción A — desde el sitio web (más fácil):**

1. <https://vercel.com/signup> → entrá con GitHub
2. **Add New → Project** → importá el repo `licitaciones`
3. Next.js se detecta solo. **Deploy** (no instales nada: no hay dependencias extra)
4. Antes del deploy, andá a **Settings → Environment Variables** y agregá estas **9**:

| Nombre | Valor |
|---|---|
| `DATABASE_URL` | el de tu `.env`, con la contraseña nueva |
| `DIRECT_URL` | ídem |
| `AUTH_SECRET` | el de tu `.env` |
| `CRON_SECRET` | el de tu `.env` |
| `RESEND_API_KEY` | `re_...` |
| `EMAIL_FROM` | `Licitaciones <onboarding@resend.dev>` |
| `EMAIL_CLIENTE_DEMO` | tu email |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://bdexhlcebqhrgwhgppdn.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` |

5. **Deploy**. Te da una URL tipo `https://licitaciones-abc123.vercel.app`

**Opción B — desde la terminal:**

```bash
npx vercel login
npx vercel
```

Respondé: `Y` al setup, `N` a "link to existing project", y el nombre `licitaciones`.

### Después del deploy

1. Entrá a la URL. Debería pedirte login.
2. Logueate con `admin@demo.com` / `Admin123!`
3. Verificá en **Vercel → tu proyecto → Cron Jobs** que el cron figura activo.

> **Limitación de Vercel Hobby:** los cron corren **una vez por día**. Para que el
> vencimiento se note rápido, configurá GitHub Actions (más abajo) que corre cada 30 min.

### El job programado en producción

En el repo → **Settings → Secrets and variables → Actions**:

- **Secrets** → New repository secret → `CRON_SECRET` = el de tu `.env`
- **Variables** → New repository variable → `APP_URL` = `https://TU-URL.vercel.app`

El workflow `.github/workflows/cron.yml` ya está en el repo y llama al mismo endpoint
cada 30 minutos. Además tiene un botón **Run workflow** para dispararlo a mano.

### Si algo falla

| Síntoma | Causa | Solución |
|---|---|---|
| `PrismaClientInitializationError` | falta `DATABASE_URL` o el pooler rechaza | Verificá la variable en Vercel. Debe incluir `?sslmode=require&connection_limit=5` |
| `Can't reach database server` | el proyecto de Supabase está pausado | Entra al dashboard de Supabase y reanúdalo |
| Los correos no llegan | `EMAIL_FROM` sin verificar | Usá `onboarding@resend.dev` |
| `401` en todo | `AUTH_SECRET` distinto al local | Vercel genera uno si no lo cargás; copiá el que ya tenés en tu `.env` |
| Build falla | falta alguna variable | Vercel muestra el error exacto en **Deployments** |

---

## Entregable 4 — Evidencia del correo con el adjunto ⬜ falta una captura

**Estado:** los correos **ya se enviaron** y hay IDs del proveedor.

**Lo automático (ya hecho):** `EVIDENCIAS.md` tiene la tabla con los IDs de Resend y
el estado `delivered`. Eso es el "log del proveedor" que pide el enunciado.

**Lo que falta, solo tuyo:** una captura de tu bandeja.

1. Abrí <https://mail.google.com> con tu cuenta
2. Buscá los correos de "Licitaciones" (o `onboarding@resend.dev`)
3. Abrí el que dice "Propuesta comercial LIC-..."
4. Verificá que el PDF se vea **abajo** como adjunto
5. Captura con **Win + Shift + S** (Recortes de pantalla)
6. Guardala como `evidencia/01-correo-recibido.png`

Para regenerar correos frescos:

```bash
npx tsx --env-file=.env scripts/demo-email.ts
```

---

## Entregable 5 — Evidencia del documento por URL real ✅ automático + 1 captura

**Lo automático (ya hecho):** `EVIDENCIAS.md` prueba que el documento se descarga
**sin sesión**:

```
| Código HTTP | 200 OK |
| Tamaño recibido | 4480 bytes |
| Cabecera Content-Type | application/pdf |
| Primeros bytes | %PDF-  OK |
```

Y el PDF quedó descargado en `evidencia/propuesta-descargada.pdf`.

**Lo que falta:** dos capturas tuyas.

1. **Del panel** (prueba de que la web funciona):
   - `npm run dev`, abrir <http://localhost:3000>
   - Entrar como admin
   - Captura → `evidencia/02-panel.png`
2. **Del detalle con el historial** (prueba del requisito 2 y 7):
   - Entrar a una licitación marcada como **Perdida**
   - Se ve el historial con `activa → perdida` y la etiqueta **Sistema · vencimiento**
   - Captura → `evidencia/03-detalle-historial.png`

---

## Checklist final antes de entregar

- [ ] El repo en GitHub es **público** y se ve el README renderizado
- [ ] La URL de Vercel funciona y podés loguearte
- [ ] El cron figura activo en Vercel o en GitHub Actions
- [ ] La contraseña de la base **fue rotada**
- [ ] `evidencia/01-correo-recibido.png` existe
- [ ] `evidencia/02-panel.png` existe
- [ ] `evidencia/03-detalle-historial.png` existe
- [ ] `EVIDENCIAS.md` está commiteado
- [ ] El README tiene el enlace de producción
- [ ] Corriste `npm test`, `npm run test:smoke` y `npm run test:paginas` y dan verde

## Comandos de verificación antes de entregar

```bash
npm run typecheck      # TypeScript
npm test               # 46 tests unitarios
npm run build          # build de producción
npm run dev            # en otra terminal
npm run test:smoke     # 54 verificaciones end-to-end
npm run test:paginas   # 15 verificaciones de páginas
npm run test:produccion  # 18 verificaciones contra el deploy real
```

Y la documentación de la API, que también se puede abrir a mano:
<https://licitaciones-mu-sepia.vercel.app/api-docs>

Si los tres de tests dan verde, podés decir en la entrevista que el flujo completo
está verificado automáticamente.
