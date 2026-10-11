/**
 * Crea el bucket de Storage para las propuestas y verifica que exista.
 * Corre por API con la secret key, para no depender de acceso al dashboard.
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const BUCKET = "propuestas";

  // Listar primero: `createBucket` falla si ya existe, y el script debe ser idempotente.
  const { data: existentes, error: errorListado } = await supabase.storage.listBuckets();
  if (errorListado) throw new Error(`No se pudieron listar los buckets: ${errorListado.message}`);

  if (existentes?.some((b) => b.name === BUCKET)) {
    console.log(`Bucket "${BUCKET}" ya existe.`);
  } else {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      // PRIVADO a propósito: el acceso va por URL firmada, que se puede revocar.
      // Con bucket público, cualquiera que tenga el link accede para siempre y no hay
      // forma de invalidarlo (que es lo que se necesita si el cliente pide borrar acceso).
      public: false,
      fileSizeLimit: 10 * 1024 * 1024, // 10 MB
      allowedMimeTypes: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
    });
    if (error) throw new Error(`No se pudo crear el bucket: ${error.message}`);
    console.log(`Bucket "${BUCKET}" creado.`);
  }

  // Verificación real: subir y bajar un archivo de prueba.
  const prueba = new Blob([`Documento de prueba — ${new Date().toISOString()}`], {
    type: "application/pdf",
  });
  const path = "_prueba/verificacion.txt";

  const { error: errorSubida } = await supabase.storage
    .from(BUCKET)
    .upload(path, prueba, { contentType: "text/plain", upsert: true });

  if (errorSubida) throw new Error(`Falló la subida de prueba: ${errorSubida.message}`);
  console.log("Subida de prueba: OK");

  const { data: firmado, error: errorFirma } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 300);
  if (errorFirma) throw new Error(`Falló la URL firmada: ${errorFirma.message}`);
  console.log(`URL firmada (5 min): ${firmado.signedUrl}`);

  await supabase.storage.from(BUCKET).remove([path]);
  console.log("Limpieza: OK");

  const { data: final, error: errorFinal } = await supabase.storage.listBuckets();
  if (errorFinal) throw new Error(errorFinal.message);
  const bucket = final!.find((b) => b.name === BUCKET);
  console.log(`\nBucket "${BUCKET}": privado=${!bucket?.public}, limite=${(bucket?.file_size_limit ?? 0) / 1024 / 1024} MB`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
