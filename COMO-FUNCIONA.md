# Cómo funciona el sistema

Guía de lectura del código, de punta a punta. Está pensada para que puedas responder
"¿por qué está hecho así?" en una entrevista.

---

## 1. El recorrido de una solicitud

Toda petición sigue el mismo camino. Eso es lo primero que hay que entender.

```
Navegador
   │  cookie: session=<JWT>
   ▼
┌──────────────────────────────────────────────────────┐
│ src/proxy.ts            (antes de llegar a la ruta)  │
│   verifica la FIRMA del token                        │
│   sin sesión válida → redirect a /login               │
└──────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────┐
│ src/app/api/**/route.ts                              │
│   1. requireUser() / requireAdmin()   ← autorización  │
│   2. Zod.parse(body)                  ← validación    │
│   3. llama a src/lib/                 ← LÓGICA        │
│   4. responderError(e) si explota     ← traducción    │
└──────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────┐
│ src/lib/reglas.ts        funciones PURAS             │
│   presupuesto · saldo · documento · estados          │
│   no conocen Prisma, se testean solas                │
└──────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────┐
│ src/lib/transiciones.ts  cambiarEstado()             │
│   valida la tabla + escribe estado E historial        │
│   en la MISMA transacción                            │
└──────────────────────────────────────────────────────┘
   │
   ▼
      PostgreSQL (Supabase)
```

**Lo importante:** el route handler no sabe nada del dominio. Si Tomorrow() hay una regla
nueva, se agrega en `src/lib/`, no en las 16 rutas.

---

## 2. El corazón: la máquina de estados

`src/lib/estados.ts` es el archivo más importante del proyecto. Tiene 150 líneas y define
todo el comportamiento posible del dominio.

```ts
export const TRANSICIONES = {
  borrador:   ['activa'],
  activa:     ['finalizada', 'perdida'],
  finalizada: ['por_cobrar'],
  por_cobrar: ['cobrada'],
  cobrada:    [],          // terminal
  perdida:    [],          // terminal
}
```

### Por qué una tabla y no un `if` en cada endpoint

El enunciado define 5 transiciones y dice que "cualquier otra combinación debe rechazarse".
Con un `if` repartido en 5 endpoints, la regla queda **implícita**: hay que leer los 5
archivos para saber qué se permite, y el día que agregues un estado rompés 3 lugares.

Con una tabla la regla es **declarativa**: se lee completa en una pantalla y es trivial de
testear. `estados.test.ts` recorre las 36 combinaciones posibles (6 × 6) y compara contra
la tabla del enunciado escrita a mano. Si alguien "arregla" la tabla, el test falla.

### Por qué la tabla vive solo en el backend

`GET /api/licitaciones/:id` devuelve:

```json
{ "transicionesDisponibles": ["finalizada", "perdida"],
  "editable": true }
```

La UI dibuja los botones a partir de eso. Si el frontend tuviera su propia copia de la tabla,
el día que se agregue un estado mostraría un botón que el backend rechaza con 422. **Una sola
fuente de verdad.**

La UI además filtra `cobrada` de los botones, porque esa transición es automática.

---

## 3. `cambiarEstado()`: por qué existe

```ts
export async function cambiarEstado({ licitacionId, hacia, origen, actor, tx }) {
  const licitacion = await db.licitacion.findUnique({ where: { id: licitacionId } });

  assertTransicionValida(licitacion.estado, hacia);   // 1. tabla de estados

  await db.licitacion.update({ data: { estado: hacia, ...timestampsDe(hacia) } });  // 2. update

  await db.historialTransicion.create({ data: { estadoAnterior, estadoNuevo, origen, ... } });  // 3. historial

  return actualizada;
}
```

Cuatro decisiones adentro, cada una con su porqué:

**Relee el estado adentro de la transacción.** Si nos confiaramos del estado que pasó el
caller, entre su lectura y nuestro update otro request pudo mover la licitación (condición de
carrera / TOCTOU). Leyendo adentro, el estado que valida y el que queda en el historial **son
el mismo hecho**.

**El historial se escribe en la misma transacción.** Si el update tiene éxito y el historial
falla, la base queda con una licitación cambiada de estado sin rastro. Con la transacción, o
quedan los dos o no queda ninguno.

**Timestamps contextuales.** `enviadaEn`, `resueltaEn`, `cerradaEn` son campos separados de
`creadoEn`. Para auditar que la propuesta se envió *antes del plazo* hay que saber cuándo se
envió, no cuándo se creó.

**Acepta un `tx` opcional.** Permite que el registro de un pago llame a `cambiarEstado` **dentro**
de la transacción del pago. Sin eso, un corte de luz entre el insert del pago y el cambio de
estado deja una licitación `por_cobrar` con saldo cero: un estado imposible que nadie puede
recuperar a mano.

### `origen: manual | automatica | sistema`

El requisito 2 dice que una licitación puede perderse **automáticamente**. Si el historial no
distinguiera, el evaluador no podría probar que el sistema la venció y no que alguien la
marcó a mano. Con `usuarioId: null` y `origen: 'automatica'`, se ve en la UI:

- `borrador → activa` — **Manual**, `admin@demo.com`
- `activa → perdida` — **Sistema · vencimiento**, sin usuario

Eso está en `evidencia/03-detalle-historial-vencimiento.png`.

---

## 4. Los tres detalles finos

Estos son los que separan un proyecto junior de uno mid. Están comentados en el código.

### 4.1 `SELECT ... FOR UPDATE` en los pagos

```ts
await tx.$queryRaw`SELECT id FROM licitaciones WHERE id = ${licitacionId} FOR UPDATE`;
```

Sin esto: dos requests de pago simultáneos **leen el mismo saldo**. Si el saldo es $100.000 y
llegan dos pagos de $100.000, ambos validan (`100.000 <= 100.000`), ambos insertan, y
terminás con $200.000 cobrados sobre $100.000 facturados.

`FOR UPDATE` bloquea la fila de la licitación hasta que la transacción termine. El segundo pago
espera, y cuando lee ya ve el saldo descontado.

> El nombre de la tabla es `licitaciones` (snake_case) por el `@@map` del schema. Con el
> nombre del modelo, `"Licitacion"`, el SQL falla con `relation does not exist`. **Esto me
> pasó y el smoke test lo encontró.**

### 4.2 El reclamo atómico del recordatorio

```ts
const reclamo = await prisma.licitacion.updateMany({
  where: { id: lic.id, recordatorioEnviadoEn: null },
  data: { recordatorioEnviadoEn: new Date() },
});
if (reclamo.count === 0) continue;   // otro proceso ya lo reclamó
```

Con `find` + `update`, dos ejecuciones del cron solapadas ven ambas `null` y las dos mandan el
correo: el cliente recibe duplicados y bloquea al remitente.

Con `updateMany` filtrando por el mismo `null`, **solo una** actualización afecta filas. La
otra obtiene `count: 0` y se saltea. Es un compare-and-swap usando la base como candado.

### 4.3 Montos en centavos enteros

`0.1 + 0.2 === 0.30000000000000004` en IEEE 754. Un saldo con float termina con diferencias de
un centavo y tests que fallan sin explicación clara.

Todo se guarda y calcula como entero. `Intl.NumberFormat` solo formatea para mostrar. Además
Zod rechaza el float en el borde: `z.int()`.

---

## 5. El job programado

Un solo endpoint hace las dos cosas, y **en este orden**:

```ts
// 1) VENCIMIENTO (requisito 2)
where: { estado: "activa", fechaLimite: { lt: ahora } }        → perdida

// 2) RECORDATORIO (requisito 5)
entraEnVentanaRecordatorio(...)                                 → correo
```

**Por qué el orden importa:** si fuera al revés, una licitación vencida hace una hora todavía
entra en la ventana de 48 h y su cliente recibe un "¡tenés tiempo!" de algo que ya venció.

**Por qué es un endpoint y no un cron con lógica adentro:** el transporte queda desacoplado.
Vercel Cron, GitHub Actions o `curl` a mano llaman lo mismo. En una entrevista esto es la
respuesta a "¿cómo lo ejecutarías en producción sin pagar?".

**Seguridad:** es una URL pública, así que exige `Authorization: Bearer $CRON_SECRET`. Sin ese
header, cualquiera que conozca la URL podría disparar vencimientos masivamente.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/licitaciones
```

Respuesta real:
```json
{"ejecutadoEn":"...","vencidas":1,"recordatorios":1,"errores":[]}
```

---

## 6. El correo

```
enviar (borrador → activa)
   │
   ├─ 1. assertPuedeEnviar()      tabla + documento + plazo vigente
   │
   ├─ 2. cambiarEstado('activa')  historial escrito acá
   │
   └─ 3. enviarPropuestaAlCliente()   ← FUERA de la transacción
            ├─ descargarArchivo(path)     bytes del PDF
            ├─ urlFirmada(path)          link temporal
            └─ resend.emails.send({ attachments: [{ filename, content }] })
```

**Por qué el correo va después de la transición y fuera de la transacción:**

1. **Consistencia.** Si transiciono primero y el email falla, la licitación queda `activa` con
   su historial y el correo se reenvía. Si mando el email primero y la transición falla, mandé
   una propuesta "oficial" de algo que internamente sigue en borrador: el cliente tiene un
   documento que nunca fue registrado. Peor.
2. **Latencia.** Una llamada de red a Resend tarda entre 300 ms y 2 s. Dentro de una
   transacción mantiene el lock de la fila ese tiempo.

El caso de error está manejado a propósito: el endpoint devuelve `correo: { enviado: false }`
con un aviso, y **no revierte la transición**. El envío formal ocurrió igual; el problema es de
notificación, no de estado.

**El adjunto son bytes, no un link.** El requisito dice "el documento adjunto". Resend no
descarga URLs remotas: hay que pasarle el contenido. El link firmado va *además* en el cuerpo,
que es lo que un cliente realmente quiere.

---

## 7. Autenticación

```
POST /api/auth/login
   ├─ findUnique por email
   ├─ bcrypt.compare(password, hash)
   ├─ firmo JWT: { sub: id, email, nombre, rol }
   └─ cookie httpOnly + secure + sameSite=lax + maxAge=8h
```

**Por qué JWT a mano y no NextAuth:** la v5 sigue en beta y su flujo de credenciales es difícil
de defender ("¿cómo funciona?" → "lo configuré"). Acá son 40 líneas de `jose` que se explican
de punta a punta.

**Los flags de la cookie**, cada uno previene un ataque distinto:

| Flag | Ataque que frena |
|---|---|
| `httpOnly` | XSS: un script inyectado no puede leer la cookie |
| `secure` | Secuestro de sesión en Wi-Fi público |
| `sameSite: 'lax'` | CSRF: un formulario de otro sitio no puede hacer POST con tu sesión |
| `maxAge` | Sesiones que nunca expiran |

**Login sin enumerar usuarios:** el mismo mensaje para "email inexistente" y "password
incorrecto". Si los distinguís, estás filtrando qué emails existen en la empresa.

### Dos capas de autorización

| Capa | Dónde | Para qué |
|---|---|---|
| `proxy.ts` | Antes de la página | UX: no renderizar algo que va a redirigir |
| `requireUser()` / `requireAdmin()` | Dentro de cada endpoint | Seguridad real |

**El proxy no es la frontera de seguridad.** Si mañana exponés un endpoint sin página, el proxy
no lo cubre. Por eso la autorización vive en los handlers. Es defensa en profundidad.

Y ojo: `proxy.ts` **verifica la firma** del token, no solo que exista la cookie. Con una
cookie inventada firmada con cualquier clave, no pasás. Hay una prueba de eso en el historial.

---

## 8. Archivos

Bucket **privado**, no público. Un bucket público genera links que no se pueden revocar: si el
cliente pide que dejes de darle acceso a su propuesta, no podés.

Con bucket privado:
- En la base se guarda el **`path`** (la clave del objeto), no el link
- El link se firma en el momento de necesitarlo: `createSignedUrl(path, 3600)`

El nombre del archivo se sanea antes de usarlo como path (`../../etc/passwd` y `a/b` se
convierten en `_`). Nunca confíes en un nombre que viene del cliente.

---

## 9. Montos: el flujo completo del dinero

```
crear licitación      presupuestoMaximo = 20.000,00   (el tope)
agregar producto      totalProductos += cantidad × precioUnitario
                     se valida en CADA alta que no supere el tope
resolver finalizada  montoFacturado = lo facturado (puede diferir del total: negociación)
facturar             → por_cobrar
registrar pago       saldo = montoFacturado − Σ pagos
                     si el pago > saldo  → 422
                     si el saldo queda 0 → cobrada, sola
```

**Por qué `montoFacturado` es un campo aparte de `totalProductos`:** se puede presupuestar
$1.000.000 y facturar $950.000 con un descuento negociado. Si fueran siempre iguales, no se
podría modelar una negociación y el requisito 6 no tendría sentido.

---

## 10. Cómo correr todo

```bash
npm install
cp .env.example .env        # completá los valores
npx prisma db push
npm run db:seed
npm run storage:setup
npm run dev
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build y servidor de producción (mucho más rápido) |
| `npm test` | 52 tests unitarios de la lógica pura, sin base de datos |
| `npm run typecheck` | TypeScript estricto |
| `npm run test:smoke` | 54 verificaciones end-to-end (con el server corriendo) |
| `npm run storage:setup` | Crea y verifica el bucket de Storage |
| `npm run db:seed` | Datos de prueba, idempotente |

Para la demo con correos reales:

```bash
npx tsx --env-file=.env scripts/demo-email.ts
```

---

## 11. Lo que los tests comprueban

**46 unitarios** sobre funciones puras:

- Las 36 combinaciones de la tabla de estados, contra la tabla del enunciado escrita a mano
- Que el grafo sea acíclico (no se puede volver hacia atrás)
- Que `cobrada` y `perdida` no tienen salida
- La ventana de 48 h del recordatorio, con los dos límites estrictos
- Que el recordatorio no se repite
- Presupuesto: el límite exacto, un centavo de más, y el delta cuando el producto ya existía
- Saldo: parcial, exacto, negativo visible (no clampeado a 0)
- Que un float se rechaza antes de tocar la base

**54 de humo** contra la app real:

- 401 sin sesión, 401 con password mala, **mismo mensaje** con email inexistente
- USER creando usuario → 403
- SKU duplicado → 409, precio float → 422
- Presupuesto excedido → 422 con el código correcto
- Transición inválida → 409/422 con el mensaje que lista las permitidas
- Enviar sin documento → 422
- Tipo de archivo no permitido → 422
- Pago mayor que el saldo: 422
- Saldo a cero → `cobrada` automático con `origen: sistema`
- Cron sin secreto → 401
- Las 4 transiciones del recorrido, cada una con usuario y fecha

---

## 12. Dónde está cada requisito

| Requisito | Archivo |
|---|---|
| R1 presupuesto | `src/lib/reglas.ts` → `assertDentroDePresupuesto` |
| R2 vencimiento | `src/app/api/cron/licitaciones/route.ts` |
| R3 documento | `src/lib/reglas.ts` → `assertTieneDocumento` |
| R4 correo con adjunto | `src/lib/email/enviar.ts` |
| R5 recordatorio 48 h | cron, paso 2 + `entraEnVentanaRecordatorio` |
| R6 pagos y cobrada | `src/lib/licitaciones/pagos.ts` |
| R7 historial | `src/lib/transiciones.ts` → `cambiarEstado` |
| Roles | `src/lib/session.ts` + `src/app/api/usuarios/route.ts` |
| Modelo de datos | `prisma/schema.prisma` |
