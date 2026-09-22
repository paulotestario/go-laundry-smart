// Diagnóstico simples (sem dados sensíveis): diz se o Vercel Blob está conectado.
import { list } from "@vercel/blob";

export default async function handler(req, res) {
  const blobConfigurado = !!process.env.BLOB_READ_WRITE_TOKEN;
  let listaOk = false;
  let erro = null;
  if (blobConfigurado) {
    try {
      await list({ limit: 1 });
      listaOk = true;
    } catch (e) {
      erro = e?.message || String(e);
    }
  }
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ blobConfigurado, listaOk, erro });
}
