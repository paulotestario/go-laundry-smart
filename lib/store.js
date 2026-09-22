// Armazenamento em JSON sobre Vercel Blob (store PRIVADO).
// Cada "coleção" é um arquivo JSON (ex.: filiais.json) com sufixo aleatório;
// leitura exige token (fetch com Authorization) — nada é publicamente baixável.
import { put, list, del } from "@vercel/blob";

function authHeaders() {
  return { Authorization: "Bearer " + (process.env.BLOB_READ_WRITE_TOKEN || "") };
}

export function temBlob() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export function uid() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Lê a versão mais recente da coleção (ou `fallback` se não existir).
export async function readJson(prefix, fallback = null) {
  try {
    const { blobs } = await list({ prefix });
    if (!blobs.length) return fallback;
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const r = await fetch(blobs[0].url, { cache: "no-store", headers: authHeaders() });
    if (!r.ok) return fallback;
    return await r.json();
  } catch {
    return fallback;
  }
}

// Grava a coleção (sufixo aleatório) e remove versões antigas do mesmo prefixo.
export async function writeJson(basename, prefix, obj) {
  if (!temBlob()) {
    const e = new Error("Blob Store não configurado (BLOB_READ_WRITE_TOKEN ausente).");
    e.code = "NO_BLOB";
    throw e;
  }
  const blob = await put(basename, JSON.stringify(obj), {
    access: "private",
    contentType: "application/json; charset=utf-8",
    addRandomSuffix: true,
  });
  try {
    const { blobs } = await list({ prefix });
    const antigos = blobs.filter((b) => b.url !== blob.url).map((b) => b.url);
    if (antigos.length) await del(antigos);
  } catch { /* limpeza best-effort */ }
  return blob;
}
