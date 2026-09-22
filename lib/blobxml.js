// Helpers de armazenamento: cada "coleção" é um arquivo XML no Vercel Blob.
// Gravação com sufixo aleatório (URL não adivinhável) + limpeza das versões antigas.
import { put, list, del } from "@vercel/blob";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false, // mantém tudo como string; a gente converte quando precisa
  trimValues: true,
});

export function escapeXml(v) {
  return String(v ?? "").replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c])
  );
}

// Serializa objeto/array aninhado em XML. Arrays repetem a tag do pai por item
// quando passados via {tag, itemTag, items}. Para uso simples, veja buildXml.
export function toXml(obj, indent = "  ") {
  let s = "";
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      for (const it of v) {
        if (it && typeof it === "object") s += `${indent}<${k}>\n${toXml(it, indent + "  ")}${indent}</${k}>\n`;
        else s += `${indent}<${k}>${escapeXml(it)}</${k}>\n`;
      }
    } else if (v && typeof v === "object") {
      s += `${indent}<${k}>\n${toXml(v, indent + "  ")}${indent}</${k}>\n`;
    } else {
      s += `${indent}<${k}>${escapeXml(v)}</${k}>\n`;
    }
  }
  return s;
}

export function buildXml(rootTag, obj) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootTag}>\n${toXml(obj)}</${rootTag}>\n`;
}

// Lê o blob mais recente de um prefixo e devolve o texto XML (ou null).
export async function readXml(prefix) {
  try {
    const { blobs } = await list({ prefix });
    if (!blobs.length) return null;
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const r = await fetch(blobs[0].url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

// Faz o parse do XML para objeto JS (ou null).
export function parseXml(xmlText) {
  try {
    return parser.parse(xmlText);
  } catch {
    return null;
  }
}

// Grava o XML no blob (sufixo aleatório) e remove versões antigas do mesmo prefixo.
export async function writeXml(basename, prefix, xmlText) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const e = new Error("Blob Store não configurado (BLOB_READ_WRITE_TOKEN ausente).");
    e.code = "NO_BLOB";
    throw e;
  }
  const blob = await put(basename, xmlText, {
    access: "public",
    contentType: "application/xml; charset=utf-8",
    addRandomSuffix: true,
  });
  try {
    const { blobs } = await list({ prefix });
    const antigos = blobs.filter((b) => b.url !== blob.url).map((b) => b.url);
    if (antigos.length) await del(antigos);
  } catch { /* limpeza best-effort */ }
  return blob;
}

// Sempre retorna array (fast-xml-parser colapsa listas de 1 item em objeto).
export function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}
