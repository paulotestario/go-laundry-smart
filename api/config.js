// API de configuração — lê/grava um config.xml compartilhado no Vercel Blob.
// GET  /api/config  -> retorna o config.xml (application/xml). Sem blob ainda, devolve o padrão.
// POST /api/config  -> recebe JSON { duracaoPadrao:{ lavadora, secadora } }, valida e grava o XML.
//
// Requer o Vercel Blob conectado ao projeto (variável BLOB_READ_WRITE_TOKEN, criada
// automaticamente ao adicionar um Blob Store nas Storage settings do projeto na Vercel).
import { put, list } from "@vercel/blob";

const BLOB_NAME = "config.xml";
const DEFAULT = { duracaoPadrao: { lavadora: 50, secadora: 40 } };

function escapeXml(v) {
  return String(v).replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c])
  );
}

// Serializa um objeto (aninhado) em XML — extensível: novos campos de config
// são só adicionar no objeto, sem mudar esta função.
function toXml(obj, indent = "  ") {
  let s = "";
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      s += `${indent}<${k}>\n${toXml(v, indent + "  ")}${indent}</${k}>\n`;
    } else {
      s += `${indent}<${k}>${escapeXml(v)}</${k}>\n`;
    }
  }
  return s;
}

function buildXml(obj) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n${toXml(obj)}</config>\n`;
}

function clampInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 && n <= 600 ? n : def;
}

async function readConfigXml() {
  try {
    const { blobs } = await list({ prefix: BLOB_NAME });
    const b = blobs.find((x) => x.pathname === BLOB_NAME) || blobs[0];
    if (!b) return null;
    const r = await fetch(b.url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    let xml = await readConfigXml();
    if (!xml) xml = buildXml(DEFAULT);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(xml);
  }

  if (req.method === "POST" || req.method === "PUT") {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({
        erro: true,
        mensagem:
          "Blob Store não configurado. Adicione um Blob Store ao projeto na Vercel (Storage) para criar BLOB_READ_WRITE_TOKEN.",
      });
    }
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};
    // whitelist + validação (por enquanto só duração padrão)
    const config = {
      duracaoPadrao: {
        lavadora: clampInt(body?.duracaoPadrao?.lavadora, DEFAULT.duracaoPadrao.lavadora),
        secadora: clampInt(body?.duracaoPadrao?.secadora, DEFAULT.duracaoPadrao.secadora),
      },
    };
    const xml = buildXml(config);
    try {
      await put(BLOB_NAME, xml, {
        access: "public",
        contentType: "application/xml; charset=utf-8",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    } catch (e) {
      return res.status(500).json({ erro: true, mensagem: "Falha ao gravar: " + (e?.message || e) });
    }
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    return res.status(200).send(xml);
  }

  res.setHeader("Allow", "GET, POST, PUT");
  return res.status(405).json({ erro: true, mensagem: "Método não permitido" });
}
