/**
 * ALMACENAMIENTO DE PROPUESTAS (Supabase Storage)
 * ================================================
 *
 * POR QUÉ BUCKET PRIVADO Y NO PÚBLICO
 * ----------------------------------
 * Un bucket público solo permite generar URLs con `getPublicUrl`: el link sirve para
 * siempre y no hay forma de invalidarlo. Si el cliente pide que dejes de darle acceso
 * a su propuesta, no podés hacerlo.
 *
 * Con bucket privado usás `createSignedUrl(path, segundos)`, que genera un link
 * TEMPORAL. Guardo en la base el `path` (la clave del objeto), no el link: el link se
 * genera en el momento de necesitarlo, así puedo cambiar la duración o revocarlo.
 *
 * POR QUÉ `service_role` Y NO `anon`
 * ----------------------------------
 * El bucket es privado, y la `anon` respeta las Row Level Security de Supabase: con RLS
 * activa no sube nada. Necesito la `service_role`, que las ignora. Por eso NUNCA puede
 * llevar el prefijo `NEXT_PUBLIC_`: eso la mandaría al navegador de cualquier visitante.
 */

import { createClient } from "@supabase/supabase-js";
import { errores } from "./errores";

export const BUCKET_PROPUESTAS = "propuestas";

export const TIPOS_PERMITIDOS: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const TAMANO_MAXIMO = 10 * 1024 * 1024; // 10 MB

function clienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type ArchivoSubido = {
  path: string;
  nombre: string;
  mime: string;
  tamano: number;
};

/**
 * Sube la propuesta de una licitación.
 *
 * El `path` lleva el ID de la licitación como prefijo: evita colisiones entre archivos
 * y permite borrar todo lo de una licitación con un solo `remove()` por prefijo.
 */
export async function subirPropuesta(licitacionId: string, archivo: File): Promise<ArchivoSubido> {
  const extension = (archivo.name.split(".").pop() ?? "").toLowerCase();
  const mimeEsperado = TIPOS_PERMITIDOS[extension];

  if (!mimeEsperado) {
    throw errores.regla(
      "TIPO_NO_PERMITIDO",
      `Formato no permitido. Se aceptan: ${Object.keys(TIPOS_PERMITIDOS).join(", ").toUpperCase()}`,
      { extension },
    );
  }

  if (archivo.size === 0) {
    throw errores.regla("ARCHIVO_VACIO", "El archivo está vacío");
  }

  if (archivo.size > TAMANO_MAXIMO) {
    throw errores.regla(
      "ARCHIVO_MUY_GRANDE",
      `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo es 10 MB`,
      { tamano: archivo.size, maximo: TAMANO_MAXIMO },
    );
  }

  // Nunca confíes en el nombre que envía el cliente: "../../etc/passwd" o un nombre con
  // "/" permite escribir fuera del directorio asignado.
  const nombreSeguro = `${Date.now()}-${sanear(archivo.name)}`;
  const path = `${licitacionId}/${nombreSeguro}`;

  const { error } = await clienteAdmin()
    .storage.from(BUCKET_PROPUESTAS)
    .upload(path, archivo, { contentType: mimeEsperado, upsert: false });

  if (error) {
    throw errores.conflicto("STORAGE_ERROR", `No se pudo subir el archivo: ${error.message}`);
  }

  return { path, nombre: archivo.name, mime: mimeEsperado, tamano: archivo.size };
}

/** Genera una URL temporal para ver o descargar el documento. */
export async function urlFirmada(path: string, segundos = 3600): Promise<string> {
  const { data, error } = await clienteAdmin()
    .storage.from(BUCKET_PROPUESTAS)
    .createSignedUrl(path, segundos);

  if (error || !data) {
    throw errores.conflicto("STORAGE_ERROR", `No se pudo generar el link: ${error?.message}`);
  }
  return data.signedUrl;
}

/**
 * Descarga el archivo como Buffer, para ADJUNTARLO al correo.
 *
 * Por qué Buffer y no mandar el link: el requisito 4 pide el documento adjunto, no un
 * link. Resend no descarga URLs remotas: hay que pasarle los bytes.
 */
export async function descargarArchivo(path: string): Promise<Buffer> {
  const { data, error } = await clienteAdmin().storage.from(BUCKET_PROPUESTAS).download(path);

  if (error || !data) {
    throw errores.conflicto("STORAGE_ERROR", `No se pudo descargar el documento: ${error?.message}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Borra los archivos de una licitación (por prefijo). */
export async function borrarArchivosDe(licitacionId: string): Promise<void> {
  const supabase = clienteAdmin();
  const { data } = await supabase.storage.from(BUCKET_PROPUESTAS).list(licitacionId);
  const archivos = (data ?? []).map((f) => `${licitacionId}/${f.name}`);
  if (archivos.length === 0) return;
  await supabase.storage.from(BUCKET_PROPUESTAS).remove(archivos);
}

/** Saca cualquier cosa que sirva para escapar del directorio o romper el sistema. */
function sanear(nombre: string): string {
  return nombre
    .replace(/[/\\]/g, "_")      // separadores de ruta
    .replace(/\.\./g, "_")      // recorrido de directorios
    .replace(/[<>:"|?*\x00-\x1f]/g, "_") // caracteres inválidos en el bucket
    .slice(0, 120);
}
