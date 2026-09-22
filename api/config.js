// Configuração compartilhada em JSON (Blob privado). Protegido por token de admin.
// GET  -> retorna a config (ou o padrão). POST -> valida e grava.
import { readJson, writeJson } from "../lib/store.js";
import { requerAdmin } from "../lib/auth.js";

const DEFAULT = { duracaoPadrao: { lavadora: 50, secadora: 40 } };

function clampInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 && n <= 600 ? n : def;
}

export default async function handler(req, res) {
  if (!requerAdmin(req)) {
    res.setHeader("WWW-Authenticate", "Bearer");
    return res.status(401).json({ erro: true, mensagem: "Não autorizado" });
  }
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const cfg = await readJson("config", DEFAULT);
    return res.status(200).json(cfg || DEFAULT);
  }

  if (req.method === "POST" || req.method === "PUT") {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    const cfg = {
      duracaoPadrao: {
        lavadora: clampInt(body?.duracaoPadrao?.lavadora, DEFAULT.duracaoPadrao.lavadora),
        secadora: clampInt(body?.duracaoPadrao?.secadora, DEFAULT.duracaoPadrao.secadora),
      },
    };
    try {
      await writeJson("config.json", "config", cfg);
    } catch (e) {
      return res.status(500).json({ erro: true, mensagem: e.code === "NO_BLOB" ? e.message : "Falha ao gravar: " + (e?.message || e) });
    }
    return res.status(200).json(cfg);
  }

  res.setHeader("Allow", "GET, POST, PUT");
  return res.status(405).json({ erro: true, mensagem: "Método não permitido" });
}
