# Cómo explicar la aplicación (en simple)

Guía para entenderla y poder defenderla en una entrevista, sin tecnicismos innecesarios.

---

## La idea en una frase

Es un sistema donde una empresa **arma una licitación para un cliente**, le **manda la
propuesta por email con el PDF adjunto**, le **recuerda que se le vence**, y después
**le cobra si la ganó**. Todo queda anotado.

---

## ¿Qué es el frontend?

**Lo que ve la persona.**

Es la web donde el usuario trabaja: entra con su usuario y contraseña, ve el panel con
las licitaciones que están por vencerse, crea una licitación, le agrega productos, sube
el PDF y apretá "Enviar al cliente".

En este proyecto el frontend es **React**, que es lo que usa Next.js por debajo.

**Ejemplo concreto:** el botón "Enviar al cliente" en la pantalla. Cuando lo apretás, el
frontend hace una petición al backend diciendo "mandá esta licitación". El backend
responde "listo, quedó activa y el correo salió". El frontend muestra el resultado.

---

## ¿Qué es el backend?

**El que decide y guarda.**

Es la parte que:

- **Verifica** si el usuario tiene permiso
- **Aplica las reglas**: si el total no supera el presupuesto, si tiene documento, si el
  estado permite la transición
- **Guarda** los datos en la base de datos
- **Manda los emails** y **guarda los archivos**

En este proyecto el backend es **TypeScript** que corre en el mismo proyecto que el
frontend, usando Next.js. Se expone como **API REST**: direcciones como
`/api/licitaciones` que responden con datos en formato JSON.

**Ejemplo concreto:** cuando apretás "Enviar", el backend no confía en el botón de la
pantalla. Vuelve a verificar todo desde cero: mira si la licitación está en borrador,
si tiene el PDF cargado y si la fecha límite ya venció. Si algo no cuadra, responde
un error y la pantalla lo muestra. Esa lógica **nunca** está en el frontend.

---

## ¿Por qué importa que el backend decida?

Porque al frontend **no se le puede confiar**.

Un usuario técnico podría llamar a la API a mano saltándose los botones. Si la regla
"no se puede enviar sin documento" estuviera en la pantalla, la podría saltear.

Por eso la regla está **siempre en el backend**:

```
El frontend DIBUJA botones. El backend DECIDE si esos botones sirven.
```

---

## Cómo se relacionan

```
Persona
  ↓ apretá un botón
Frontend (React)              ← la pantalla
  ↓ pide "POST /api/licitaciones/123/enviar"
Backend (Node/TypeScript)     ← las reglas
  ↓
Base de datos (PostgreSQL)    ← los datos
  ↓
Servicios externos            ← email (Resend), archivos (Supabase Storage)
```

---

## Los 3 conceptos que conviene saber explicar

### 1. La máquina de estados

Una licitación no pasa de cualquier estado a cualquier otro. Solo puede hacer esto:

```
borrador ──▶ activa ──▶ finalizada ──▶ por_cobrar ──▶ cobrada
                │
                └──▶ perdida
```

`cobrada` y `perdida` son finales: no se puede seguir.

Eso está escrito **en una tabla** dentro de un solo archivo
(`src/lib/estados.ts`). Cualquier otra combinación se rechaza con un error.

**Por qué importa:** garantiza que no se salten pasos. No se puede cobrar una licitación
que no se ganó, ni enviar una que no tiene propuesta.

### 2. El historial

Cada vez que una licitación cambia de estado, se anota:

- de qué estado a cuál
- quién lo hizo
- cuándo
- si lo hizo una persona o el sistema

Eso responde "¿quién movió esto?" sin adivinar.

### 3. Las tareas programadas (el cron)

Ciertas cosas tienen que pasar solas, sin que nadie esté mirando:

- Si se pasó la fecha límite de una licitación activa, **se pierde automáticamente**
- Si faltan menos de 48 horas, **se manda un recordatorio**

Eso lo corre un **job programado**: un endpoint web (`/api/cron/licitaciones`) al que
llama un servicio externo cada cierto tiempo. Puede ser Vercel, GitHub Actions, o
cualquiera. La lógica está en la aplicación; quién la llama es intercambiable.

---

## Si te preguntan "¿por qué Next.js?"

Buena respuesta:

> Next.js me deja tener la API y la pantalla en el mismo proyecto. No monto un segundo
> servidor, no configuro CORS entre dos orígenes distintos, y el despliegue es un solo
> paso. Para una aplicación CRUD como esta, la complejidad de separarlos no se justifica.
> Igual separé el código por capas: las reglas de negocio están en `src/lib/`, los
> endpoints solo validan y delegan, y la UI no tiene lógica de negocio. Si mañana
> necesito otra base de datos o quiero otro cliente, esas capas no cambian.

---

## Si te preguntan "¿cómo te aseguraste de que funciona?"

> Escribí tres tipos de pruebas:
>
> **46 tests unitarios** sobre las reglas de negocio, sin base de datos. Incluyen las 36
> combinaciones posibles de estados, comparadas contra la tabla del enunciado escrita a
> mano como especificación.
>
> **54 pruebas de humo** que hacen el recorrido completo por HTTP: crear, exceder el
> presupuesto, enviar sin documento, pagar de más, hasta que queda cobrada sola.
>
> **15 verificaciones de página** que comprueban que cada pantalla responde lo correcto y
> que los permisos se respetan.
>
> Lo más útil: esas pruebas encontraron cuatro bugs reales que a simple vista no se veían,
> entre ellos uno que hacía imposible enviar cualquier licitación.

---

## Dónde está cada cosa

| Si querés cambiar... | Mirá... |
|---|---|
| Las reglas de las transiciones | `src/lib/estados.ts` |
| La validación de presupuesto o saldo | `src/lib/reglas.ts` |
| Cómo se registra una transición | `src/lib/transiciones.ts` |
| Los datos y sus relaciones | `prisma/schema.prisma` |
| Un endpoint | `src/app/api/**/route.ts` |
| Los colores de la interfaz | `src/app/globals.css` y `src/lib/ui.ts` |
| La plantilla del email | `src/lib/email/plantillas.ts` |
| La documentación de la API | `src/lib/openapi.ts` (spec) y `src/app/api-docs/` (Swagger UI) |

---

## Si te preguntan "¿la API está documentada?"

Sí, y conviene decir **por qué está escrita en código y no en un `openapi.yaml`**.

La respuesta: un YAML escrito a mano se desactualiza en silencio. Alguien cambia un endpoint
y el documento sigue diciendo lo que decía hace tres meses; nadie se entera hasta que el
evaluador prueba un endpoint y ve que la documentación miente. Con el spec en TypeScript,
el compilador avisa apenas cambia una forma de datos.

- Se ve en `/api-docs` (Swagger UI, cargada desde el CDN para no sumar 1 MB al bundle).
- Se descarga en `/api/openapi` y se importa en Postman o Insomnia.
- Cubre los 18 paths con los 6 estados del dominio como enum, los esquemas de autenticación
  (cookie para la API, bearer para el cron) y los códigos de error de negocio.

Un detalle fino que sale bien si preguntan: Swagger UI **no puede usar la cookie de sesión**,
porque vive en el navegador y no puede leer una cookie httpOnly. Por eso la página dice que
para probar de verdad conviene importar el spec en Postman, que sí maneja cookies.

---

## Las 3 frases para resumir tu proyecto en una reunión

1. **"Es una máquina de estados con reglas de negocio testeadas."** No es un CRUD: los
   estados no se pueden saltear y cada cambio queda auditado.

2. **"El frontend no decide nada."** Pide, el backend valida. Si no estás autorizado, te
   dice que no, aunque manipules la pantalla.

3. **"Las integraciones son reales, no simuladas."** Los correos salen por Resend con el
   PDF adjunto, los archivos están en Supabase Storage con acceso privado, y el job
   programado corre en el servidor. Si algo falla, el sistema lo dice con un error claro
   en vez de fingir que funcionó.

---

## Glosario mínimo

| Palabra | Qué significa |
|---|---|
| **API** | Las direcciones web que el backend expone para que el frontend pregunte cosas |
| **Endpoint** | Una dirección concreta de la API, por ejemplo `POST /api/licitaciones` |
| **CRUD** | Crear, leer, actualizar, borrar. Lo básico de cualquier sistema |
| **Cron / job programado** | Una tarea que se ejecuta sola cada cierto tiempo |
| **JWT** | Un token que dice "esta persona es el usuario X" y va firmado por el servidor |
| **Cookie httpOnly** | Donde se guarda el JWT de forma que el navegador no lo pueda leer |
| **Transacción** | Varias operaciones que o salen todas bien o ninguna: si falla una, se deshacen las demás |
| **Monto en centavos** | Guardar los montos como números enteros para que no haya errores de redondeo |
| **Bucket privado** | Una carpeta de archivos a la que se accede con un link temporal, no con uno público |
| **Migration** | La forma de guardar los cambios del modelo de datos de forma reproducible |
