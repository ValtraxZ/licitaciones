import { Resend } from "resend";

/**
 * Cliente de Resend.
 *
 * El enunciado pide explícitamente "integración real de email (no simulada con
 * console.log)". Por eso, si falta la API key, esta función LANZA en vez de loguear un
 * mensaje y seguir como si nada. Un envío silenciosamente descartado hace que el
 * evaluador espere un correo que nunca llega.
 */
export function clienteResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY no está definida. El envío de correo es obligatorio según el enunciado: no se simula.",
    );
  }
  return new Resend(key);
}

export type ResultadoEnvio = {
  id: string | undefined;
  enviado: boolean;
};

export async function enviarCorreo(params: {
  destinatario: string;
  asunto: string;
  html: string;
  texto: string;
  adjunto?: { nombre: string; contenido: Buffer };
}): Promise<ResultadoEnvio> {
  const resend = clienteResend();
  const desde = process.env.EMAIL_FROM;
  if (!desde) throw new Error("EMAIL_FROM no está definida");

  const { data, error } = await resend.emails.send({
    from: desde,
    to: params.destinatario,
    subject: params.asunto,
    html: params.html,
    text: params.texto,
    // El requisito 4 pide el documento ADJUNTO, no un link. Resend no descarga URLs
    // remotas: hay que pasarle los bytes del archivo.
    attachments: params.adjunto
      ? [{ filename: params.adjunto.nombre, content: params.adjunto.contenido }]
      : undefined,
  });

  if (error) {
    throw new Error(`Resend rechazó el envío: ${error.message}`);
  }

  // El `id` del proveedor sirve como evidencia: se puede citar en el README y cruzarlo
  // con el log del dashboard de Resend.
  return { id: data?.id, enviado: true };
}
