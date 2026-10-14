# Evidencias de la aplicación

Generado el 13/10/2026, 09:39:17 contra `http://localhost:3000`.

Este informe reemplaza a las capturas: cada línea se puede volver a comprobar
con `curl`. Los comandos exactos están al final de cada sección.

## 1. Correo real con el documento adjunto (requisito 4)

Correo enviado desde: `Licitaciones <onboarding@resend.dev>`
Destinatario: `andrey01mckenziecast@gmail.com`

| Fecha | Asunto | Estado | ID del proveedor |
|---|---|---|---|
| 13/10/2026, 08:31:19 | Recordatorio: la propuesta LIC-2026-0006 vence en 30 h | delivered | `01a13809-0bfc-7916-b8b3-5dfdbd870583` |
| 13/10/2026, 08:31:04 | Propuesta comercial LIC-2026-0007 — Demo — vence en 5 días (fuera de la ventana) | delivered | `01a13808-d0b2-773b-a279-4bfe4f20a700` |
| 13/10/2026, 08:30:40 | Propuesta comercial LIC-2026-0006 — Demo — vence en 30 horas (recibe recordatorio) | delivered | `01a13808-7343-7ad7-9b3f-d1578aa1fef8` |
| 13/10/2026, 08:30:18 | Propuesta comercial LIC-2026-0005 — Demo — se envió a tiempo y luego venció | delivered | `01a13808-1d3e-7e57-8b15-36dd6808c544` |
| 11/10/2026, 07:21:17 | Recordatorio: la propuesta LIC-2026-0003 vence en 30 h | delivered | `01a12d7c-3765-79f4-bceb-31052ed87aa6` |
| 11/10/2026, 07:21:07 | Propuesta comercial LIC-2026-0004 — Demo — vence en 5 días (fuera de la ventana) | delivered | `01a12d7c-0f32-7cf2-8f4f-11ca35144787` |
| 11/10/2026, 07:20:50 | Propuesta comercial LIC-2026-0003 — Demo — vence en 30 horas (recibe recordatorio) | delivered | `01a12d7b-cbd5-7487-8b95-cf4ebab2c740` |
| 11/10/2026, 07:20:31 | Propuesta comercial LIC-2026-0002 — Demo — se envió a tiempo y luego venció | delivered | `01a12d7b-839c-77b2-af44-301036afa0aa` |
| 11/10/2026, 02:35:43 | Recordatorio: la propuesta LIC-2026-0004 vence en 30 h | delivered | `01a12c76-c41e-7701-8a6e-19e5e4c02e34` |
| 11/10/2026, 02:35:33 | Propuesta comercial LIC-2026-0005 — Demo — vence en 5 días (fuera de la ventana) | delivered | `01a12c76-9dc2-78fc-a4bd-34f34b17c876` |

> Los IDs son los que devuelve la API de Resend. Se pueden verificar en el
> dashboard del proveedor o con `GET https://api.resend.com/emails/{id}`.

**Cómo reproducirlo:**

```bash
npx tsx --env-file=.env scripts/demo-email.ts
```

## 2. El documento es accesible por una URL real (requisito: almacenamiento)

Licitación: **LIC-2026-0006** — Demo — vence en 30 horas (recibe recordatorio)
Archivo: `propuesta-LIC-2026-0006.pdf` (4.4 KB)

URL firmada que devuelve la API:

```
https://bdexhlcebqhrgwhgppdn.supabase.co/storage/v1/object/sign/propuestas/cmv7fnink0007lr5gnssorps5/1791941425413-propuesta-LIC-2026-0006.pdf?token=eyJraWQiOiI4NTFkMDVkZS02OGNjLTRiOGMtYWI5Zi1jMTkwMDk5MzEzMTciLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJwcm9wdWVzdGFzL2NtdjdmbmluazAwMDdscjVnbnNzb3JwczUvMTc5MTk0MTQyNTQxMy1wcm9wdWVzdGEtTElDLTIwMjYtMDAwNi5wZGYiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzkxOTQ1NTY0LCJleHAiOjE3OTE5NDkxNjR9.8LMydTabuo-FyWGRpUP2FQVLdMH00-ghRCoj0jWEKPU_GL40xgUt6ptdOXi9yBtJqgCGJu37_nuSzOmt9TJlvQ
```

**Descarga sin sesión (como lo haría el cliente):**

| Comprobación | Resultado |
|---|---|
| Código HTTP | **200** OK |
| Tamaño recibido | 4480 bytes |
| Cabecera `Content-Type` | application/pdf |
| Primeros bytes (deben ser `%PDF-`) | `%PDF-` OK |

El PDF descargado quedó en `evidencia/propuesta-descargada.pdf`.

**Por qué es una URL real y no un dato de la base:** el bucket de Storage es
**privado**. No existe una URL pública estable; lo que hay es una *URL firmada* que
genera el servidor con vencimiento. Es accesible desde el navegador sin sesión,
que es exactamente lo que necesita el cliente, y se puede revocar.

**Cómo reproducirlo:**

```bash
npx tsx --env-file=.env scripts/ver-pdf.ts
```

## 3. El job programado corrió (requisitos 2 y 5)

Ejecución real del endpoint:

```json
{
  "ejecutadoEn": "2026-10-14T02:39:22.247Z",
  "vencidas": 0,
  "recordatorios": 0,
  "errores": []
}
```

Y sin el secreto, para probar que está protegido:

```
HTTP 401  {"error":{"code":"NO_AUTORIZADO","message":"Header Authorization inválido o ausente"}}
```

**Cómo reproducirlo:**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/licitaciones
```

## 4. El historial distingue lo manual de lo automático (requisito 7)

Licitación **LIC-2026-0002** — Demo — se envió a tiempo y luego venció

| Estado anterior | Estado nuevo | Origen | Usuario | Cuándo | Comentario |
|---|---|---|---|---|---|
| activa | perdida | **automatica** | _sistema_ | 11/10/2026, 07:21:09 | Vencimiento automático: la fecha límite 2026-10-11T22:21:04.532Z fue superada |
| borrador | activa | **manual** | admin@demo.com | 11/10/2026, 07:20:23 | Enviada formalmente a andrey01mckenziecast@gmail.com |

De 2 transiciones, **1 las hizo el sistema** y 1 las hizo una persona. Eso es lo que prueba que el vencimiento es automático y no una carga manual de datos.

## 5. Correo recibido — lo que falta adjuntar a mano

Estas dos cosas las tenés que agregar vos, porque dependen de tu pantalla:

1. **Captura del correo** en tu bandeja, con el PDF visible en el adjunto.
2. **Captura del panel** con la interfaz colores (prueba de que la web funciona).

Guárdalas en la carpeta `evidencia/`:

```
evidencia/
├── 01-correo-recibido.png      <-- captura del correo con el PDF
├── 02-panel.png                <-- captura del panel
├── 03-detalle-historial.png    <-- captura del historial
├── propuesta-descargada.pdf    <-- generada por este script
└── propuesta-generada.pdf     <-- generada por este script
```