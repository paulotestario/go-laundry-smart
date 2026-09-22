// API de configuração — lê/grava um config.xml compartilhado no Vercel Blob.
// ACESSO PROTEGIDO: só admin autenticado (valida o token do Supabase via is_admin).
//
// GET  /api/config  -> retorna o config.xml (application/xml). Sem blob ainda, devolve o padrão.
// POST /api/config  -> recebe JSON { duracaoPadrao:{ lavadora, secadora } }, valida e grava o XML.
//
// Cabeçalho obrigatório: Authorization: Bearer <access_token do Supabase>.
// Requer o Vercel Blob conectado ao projeto (BLOB_READ_WRITE_TOKEN) para gravar.
import { put, list, del } from "@vercel/blob";

// Valores públicos (mesmos do front, protegidos por RLS/allowlist no Supabase).
const SUPABASE_URL = "https://mreekkooyrhpwkqhldrt.supabase.co";
const SUPABASE_ANON = "sb_publishable_vUxewmHXiRyn77WcjGdWmQ_4tGTq0JU";

const BLOB_BASENAME = "config.xml";   // recebe sufixo aleatório -> URL não adivinhável
const BLOB_PREFIX = "config";         // usado para localizar/limpar versões antigas
const DEFAULT = { duracaoPadrao: { lavadora: 50, secadora: 40 } };

function escapeXml(v) {
  return String(v).replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c])
  );
}

// Serializa objeto (aninhado) em XML — extensível: novos campos são só adicionar no objeto.
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

// ---- Autenticação: só admin (valida o JWT do Supabase chamando is_admin) ----
async function isAdmin(req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!r.ok) return false;
    return (await r.json()) === true;
  } catch {
    return false;
  }
}

// Lê o blob de config mais recente (URL nunca é exposta ao cliente).
async function readConfigXml() {
  try {
    const { blobs } = await list({ prefix: BLOB_PREFIX });
    if (!blobs.length) return null;
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const r = await fetch(blobs[0].url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // Bloqueia tudo que não seja admin autenticado
  if (!(await isAdmin(req))) {
    res.setHeader("WWW-Authenticate", "Bearer");
    return res.status(401).json({ erro: true, mensagem: "Não autorizado" });
  }

  if (req.method === "GET") {
    let xml = await readConfigXml();
    if (!xml) xml = buildXml(DEFAULT);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex");
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
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    const config = {
      duracaoPadrao: {
        lavadora: clampInt(body?.duracaoPadrao?.lavadora, DEFAULT.duracaoPadrao.lavadora),
        secadora: clampInt(body?.duracaoPadrao?.secadora, DEFAULT.duracaoPadrao.secadora),
      },
    };
    const xml = buildXml(config);
    try {
      const blob = await put(BLOB_BASENAME, xml, {
        access: "public",
        contentType: "application/xml; charset=utf-8",
        addRandomSuffix: true,      // URL não adivinhável
      });
      // remove versões antigas (mantém só a recém-gravada)
      try {
        const { blobs } = await list({ prefix: BLOB_PREFIX });
        const antigos = blobs.filter((b) => b.url !== blob.url).map((b) => b.url);
        if (antigos.length) await del(antigos);
      } catch { /* limpeza best-effort */ }
    } catch (e) {
      return res.status(500).json({ erro: true, mensagem: "Falha ao gravar: " + (e?.message || e) });
    }
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    return res.status(200).send(xml);
  }

  res.setHeader("Allow", "GET, POST, PUT");
  return res.status(405).json({ erro: true, mensagem: "Método não permitido" });
}
