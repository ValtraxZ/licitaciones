/**
 * Especificación OpenAPI de la API.
 *
 * POR QUÉ ESTO ESTÁ DEFINIDO EN TYPESCRIPT Y NO EN UN `openapi.yaml`
 * -------------------------------------------------------------
 * Un YAML escrito a mano se desactualiza en silencio: alguien cambia un endpoint y el
 * documento sigue diciendo lo que decía hace tres meses. Con el spec en código, TypeScript
 * avisa apenas cambia una forma de datos, y el JSON se sirve en `/api/openapi.json` sin
 * possibility of drift.
 *
 * Se sirve como JSON y se renderiza con Swagger UI en `/api-docs`.
 * Es la única "funcionalidad extra" del enunciado que faltaba.
 */

import { ESTADOS } from "./estados";

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

const ref = (nombre: string) => ({ $ref: `#/components/schemas/${nombre}` });

const jsonBody = (schema: object) => ({
  required: true,
  content: { "application/json": { schema } },
});

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "API de Licitaciones",
    version: "1.0.0",
    description:
      "Administración de licitaciones comerciales: se redacta una licitación, se le adjunta " +
      "una propuesta, se envía formalmente al cliente por correo con el PDF adjunto, se le " +
      "recuerda el vencimiento, se resuelve y, si se ganó, se factura y se cobra.\n\n" +
      "**Autenticación:** todas las rutas salvo el login y el job programado requieren la " +
      "cookie `session` (JWT en cookie httpOnly) que devuelve `POST /api/auth/login`.\n\n" +
      "**Montos:** todos los valores monetarios son enteros en **centavos**. `1250050` = $12.500,50. " +
      "La API rechaza decimales con `422`.\n\n" +
      "**Errores:** todos devuelven `{ \"error\": { \"code\", \"message\", \"details\" } }` con un " +
      "`code` de negocio estable. 401 sin sesión · 403 sin permiso · 404 no existe · " +
      "409 conflicto de estado · 422 regla de negocio.",
    license: { name: "MIT" },
  },
  servers: [
    { url: "https://licitaciones-mu-sepia.vercel.app", description: "Producción" },
    { url: "http://localhost:3000", description: "Desarrollo local" },
  ],
  tags: [
    { name: "Auth", description: "Inicio y cierre de sesión" },
    { name: "Catálogo", description: "Clientes y productos" },
    { name: "Licitaciones", description: "Ciclo de vida completo de una licitación" },
    { name: "Sistema", description: "Job programado" },
  ],
  paths: {
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Iniciar sesión",
        description:
          "Devuelve el JWT en una cookie httpOnly. El mismo mensaje de error se usa para " +
          "email inexistente y contraseña incorrecta: distinguirlos filtraría qué emails " +
          "pertenecen a la empresa.",
        security: [],
        requestBody: jsonBody({
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string" },
          },
        }),
        responses: {
          200: {
            description: "Sesión iniciada",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: ref("UsuarioPublico") },
                },
              },
            },
          },
          401: error("Email o contraseña incorrectos"),
          422: error("Datos inválidos"),
        },
      },
    },
    "/api/auth/logout": {
      post: { tags: ["Auth"], summary: "Cerrar sesión", responses: { 200: { description: "Cookie eliminada" } } },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Devuelve la sesión actual",
        description: "`200` con `data: null` cuando no hay sesión. No es un error: es un estado normal de la UI.",
        responses: { 200: { description: "Sesión o null" } },
      },
    },
    "/api/clientes": {
      get: {
        tags: ["Catálogo"],
        summary: "Listar clientes",
        parameters: [{ name: "q", in: "query", schema: { type: "string" }, description: "Búsqueda por nombre o email" }],
        responses: { 200: { description: "Lista de clientes" }, 401: error("Sin sesión") },
      },
      post: {
        tags: ["Catálogo"],
        summary: "Crear cliente",
        description: "El `email` es el destinatario real de las propuestas y los recordatorios.",
        requestBody: jsonBody(ref("ClienteInput")),
        responses: {
          201: { description: "Cliente creado" },
          401: error("Sin sesión"),
          422: error("Datos inválidos"),
        },
      },
    },
    "/api/productos": {
      get: {
        tags: ["Catálogo"],
        summary: "Listar productos",
        responses: { 200: { description: "Catálogo de productos" }, 401: error("Sin sesión") },
      },
      post: {
        tags: ["Catálogo"],
        summary: "Crear producto",
        description: "El precio va en centavos enteros. Un decimal se rechaza con 422.",
        requestBody: jsonBody(ref("ProductoInput")),
        responses: {
          201: { description: "Producto creado" },
          409: error("El SKU ya existe"),
          422: error("Precio no entero o negativo"),
        },
      },
    },
    "/api/usuarios": {
      get: {
        tags: ["Catálogo"],
        summary: "Listar usuarios",
        description: "El `passwordHash` nunca se devuelve: la consulta usa `select` explícito.",
        responses: { 200: { description: "Lista de usuarios" }, 401: error("Sin sesión") },
      },
      post: {
        tags: ["Catálogo"],
        summary: "Crear usuario — SOLO ADMIN",
        description: "Un usuario con rol USER recibe 403. La autorización vive en el endpoint, no en el frontend.",
        requestBody: jsonBody(ref("UsuarioInput")),
        responses: {
          201: { description: "Usuario creado" },
          401: error("Sin sesión"),
          403: error("Requiere rol ADMIN"),
          409: error("El email ya existe"),
        },
      },
    },
    "/api/licitaciones": {
      get: {
        tags: ["Licitaciones"],
        summary: "Listar licitaciones",
        parameters: [
          { name: "estado", in: "query", schema: { type: "string", enum: ESTADOS } },
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "pagina", in: "query", schema: { type: "integer", minimum: 1 } },
        ],
        responses: {
          200: { description: "Lista paginada" },
          401: error("Sin sesión"),
          422: error("Estado inválido en el filtro"),
        },
      },
      post: {
        tags: ["Licitaciones"],
        summary: "Crear licitación en borrador",
        description:
          "El estado no se puede elegir: se fuerza `borrador`. Es imposible saltear el flujo de envío.",
        requestBody: jsonBody(ref("LicitacionInput")),
        responses: {
          201: { description: "Licitación creada en borrador" },
          401: error("Sin sesión"),
          422: error("Cliente inexistente o fecha límite en el pasado"),
        },
      },
    },
    "/api/licitaciones/{id}": {
      get: {
        tags: ["Licitaciones"],
        summary: "Detalle de una licitación",
        description:
          "Devuelve datos generales, productos, pagos, saldo, historial y **las acciones " +
          "disponibles**. `transicionesDisponibles` y `editable` los calcula el servidor: el " +
          "frontend no debe reimplementar la tabla de estados.",
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          200: { description: "Detalle completo" },
          401: error("Sin sesión"),
          404: error("Licitación inexistente"),
        },
      },
    },
    "/api/licitaciones/{id}/productos": {
      get: {
        tags: ["Licitaciones"],
        summary: "Listar ítems con totales",
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: { 200: { description: "Ítems y totales" }, 404: error("Licitación inexistente") },
      },
      post: {
        tags: ["Licitaciones"],
        summary: "Agregar producto (o actualizar el existente)",
        description:
          "Solo en `borrador` y `activa`. Si el producto ya está en la licitación, se " +
          "actualiza el ítem en vez de duplicarlo.",
        parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: jsonBody(ref("ItemProductoInput")),
        responses: {
          201: { description: "Ítem agregado" },
          409: error("La licitación no es editable en su estado actual"),
          422: error("Supera el presupuesto máximo (código PRESUPUESTO_EXCEDIDO)"),
        },
      },
    },
    "/api/licitaciones/{id}/productos/{itemId}": {
      delete: {
        tags: ["Licitaciones"],
        summary: "Quitar producto",
        description: "Solo en `borrador` y `activa`. Bajar el total nunca puede exceder el presupuesto.",
        parameters: [
          { $ref: "#/components/parameters/Id" },
          { name: "itemId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Ítem quitado" },
          404: error("El ítem no pertenece a esa licitación"),
          409: error("La licitación no es editable"),
        },
      },
    },
    "/api/licitaciones/{id}/documento": {
      post: {
        tags: ["Licitaciones"],
        summary: "Subir la propuesta (multipart)",
        description:
          "Campo `archivo`. PDF, DOC o DOCX, hasta 10 MB. El bucket es **privado**: se guarda " +
          "el `path` del objeto y el link se firma al momento de necesitarlo.",
        parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: {
          required: true,
          content: { "multipart/form-data": { schema: { type: "object", properties: { archivo: { type: "string", format: "binary" } } } } },
        },
        responses: {
          201: { description: "Documento adjunto" },
          409: error("La licitación no es editable"),
          422: error("Formato no permitido o archivo muy grande"),
        },
      },
    },
    "/api/licitaciones/{id}/documento/generar": {
      post: {
        tags: ["Licitaciones"],
        summary: "Generar la propuesta en PDF y adjuntarla",
        description:
          "Arma el documento con los MISMOS datos que muestra el detalle (productos, total, " +
          "presupuesto, plazo y condiciones), así que el PDF y la pantalla no pueden " +
          "desincronizarse.",
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          201: { description: "PDF generado y adjunto" },
          409: error("La licitación no es editable"),
          422: error("No hay productos cargados"),
        },
      },
    },
    "/api/licitaciones/{id}/enviar": {
      post: {
        tags: ["Licitaciones"],
        summary: "Enviar al cliente (borrador → activa)",
        description:
          "Valida que exista documento de propuesta y que la fecha límite no haya vencido, " +
          "transiciona escribiendo el historial y **después** envía el correo real con el PDF " +
          "adjunto.\n\n" +
          "El correo va fuera de la transacción a propósito: si transiciona y el envío falla, " +
          "la licitación queda activa con su historial y el correo se puede reenviar. Al revés, " +
          "se mandaría una propuesta «oficial» de algo que sigue en borrador.",
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          200: { description: "Licitación activa; `correo` informa si el envío salió" },
          401: error("Sin sesión"),
          409: error("Transición inválida desde el estado actual"),
          422: error("Falta el documento o la fecha límite ya venció"),
        },
      },
    },
    "/api/licitaciones/{id}/resolver": {
      post: {
        tags: ["Licitaciones"],
        summary: "Marcar finalizada o perdida",
        description: "Solo desde `activa`. La pérdida por vencimiento la hace el job, no este endpoint.",
        parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: jsonBody({
          type: "object",
          required: ["resultado"],
          properties: { resultado: { type: "string", enum: ["finalizada", "perdida"] }, comentario: { type: "string" } },
        }),
        responses: {
          200: { description: "Licitación resuelta" },
          409: error("Solo una licitación activa se puede resolver"),
        },
      },
    },
    "/api/licitaciones/{id}/facturar": {
      post: {
        tags: ["Licitaciones"],
        summary: "Facturar (finalizada → por_cobrar)",
        description:
          "Si no se manda `montoFacturado`, se factura el total de los productos. Es un campo " +
          "aparte porque se puede presupuestar $1.000.000 y facturar $950.000 con un descuento.",
        parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { type: "object", properties: { montoFacturado: { type: "integer", minimum: 1 } } },
            },
          },
        },
        responses: { 200: { description: "Licitación por cobrar" }, 422: error("Monto inválido") },
      },
    },
    "/api/licitaciones/{id}/pagos": {
      get: {
        tags: ["Licitaciones"],
        summary: "Listar pagos y saldo",
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: { 200: { description: "Pagos con facturado, pagado y saldo" } },
      },
      post: {
        tags: ["Licitaciones"],
        summary: "Registrar pago (solo en por_cobrar)",
        description:
          "Solo en estado `por_cobrar`. El monto no puede superar el saldo pendiente. Cuando " +
          "el saldo llega a cero, la licitación pasa a `cobrada` **automáticamente**, con " +
          "`origen: sistema` y sin usuario en el historial.\n\n" +
          "Usa `SELECT ... FOR UPDATE` sobre la fila de la licitación: sin ese lock, dos pagos " +
          "simultáneos leerían el mismo saldo y ambos insertarían.",
        parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: jsonBody(ref("PagoInput")),
        responses: {
          201: { description: "Pago registrado; `cobradaAutomaticamente` indica si cerró la licitación" },
          409: error("Solo se pagan licitaciones en estado por_cobrar"),
          422: error("Monto no entero, no positivo o mayor al saldo"),
        },
      },
    },
    "/api/licitaciones/{id}/historial": {
      get: {
        tags: ["Licitaciones"],
        summary: "Historial de transiciones",
        description:
          "Estado anterior, estado nuevo, origen (`manual` / `automatica` / `sistema`), " +
          "usuario y fecha. El origen distingue lo que hizo una persona de lo que hizo el job.",
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: { 200: { description: "Historial completo, del más reciente al más antiguo" } },
      },
    },
    "/api/cron/licitaciones": {
      get: {
        tags: ["Sistema"],
        summary: "Job programado: vencimiento y recordatorios",
        description:
          "**Requiere** `Authorization: Bearer <CRON_SECRET>`; sin él responde 401.\n\n" +
          "Hace dos cosas, en este orden: (1) toda `activa` cuya fecha límite ya pasó pasa a " +
          "`perdida`; (2) toda `activa` a menos de 48 h del vencimiento recibe un recordatorio " +
          "por correo.\n\n" +
          "El orden importa: al revés, una licitación vencida hace una hora entraría en la " +
          "ventana de 48 h y su cliente recibiría un «¡tenés tiempo!» de algo ya vencido.",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Conteos de vencidas y recordatorios enviados" },
          401: error("Falta o es inválido el CRON_SECRET"),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "session",
        description: "JWT en cookie httpOnly que devuelve `POST /api/auth/login`.",
      },
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Valor de `CRON_SECRET`, enviado por Vercel Cron y GitHub Actions.",
      },
    },
    parameters: {
      Id: { name: "id", in: "path", required: true, schema: { type: "string" }, description: "ID de la licitación" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "PRESUPUESTO_EXCEDIDO" },
              message: { type: "string" },
              details: { description: "Datos del error, cuando aplica" },
            },
          },
        },
      },
      UsuarioPublico: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string", format: "email" },
          nombre: { type: "string" },
          rol: { type: "string", enum: ["ADMIN", "USER"] },
        },
      },
      ClienteInput: {
        type: "object",
        required: ["nombre", "email"],
        properties: {
          nombre: { type: "string", minLength: 2, maxLength: 120 },
          email: { type: "string", format: "email" },
          razonSocial: { type: "string" },
          telefono: { type: "string" },
        },
      },
      ProductoInput: {
        type: "object",
        required: ["sku", "nombre", "precioUnitario"],
        properties: {
          sku: { type: "string" },
          nombre: { type: "string" },
          descripcion: { type: "string" },
          precioUnitario: { type: "integer", minimum: 0, description: "Centavos. Un decimal devuelve 422." },
        },
      },
      UsuarioInput: {
        type: "object",
        required: ["email", "nombre", "password"],
        properties: {
          email: { type: "string", format: "email" },
          nombre: { type: "string" },
          password: { type: "string", minLength: 8 },
          rol: { type: "string", enum: ["ADMIN", "USER"], default: "USER" },
        },
      },
      LicitacionInput: {
        type: "object",
        required: ["titulo", "clienteId", "presupuestoMaximo", "fechaLimite"],
        properties: {
          titulo: { type: "string", minLength: 3 },
          descripcion: { type: "string" },
          clienteId: { type: "string" },
          presupuestoMaximo: { type: "integer", minimum: 1, description: "Centavos" },
          fechaLimite: { type: "string", format: "date-time" },
        },
      },
      ItemProductoInput: {
        type: "object",
        required: ["productoId", "cantidad", "precioUnitario"],
        properties: {
          productoId: { type: "string" },
          cantidad: { type: "integer", minimum: 1 },
          precioUnitario: { type: "integer", minimum: 0 },
        },
      },
      PagoInput: {
        type: "object",
        required: ["monto", "metodo"],
        properties: {
          monto: { type: "integer", minimum: 1, description: "Centavos, no puede superar el saldo" },
          metodo: { type: "string", enum: ["transferencia", "efectivo", "tarjeta", "otro"] },
          referencia: { type: "string" },
          notas: { type: "string" },
          fechaPago: { type: "string", format: "date-time" },
        },
      },
    },
  },
  security: [{ cookieAuth: [] }],
} as const;

export type OpenApiSpec = typeof openapi;
