// Endpoint de autenticação (sem Supabase).
// POST /api/auth  { acao:"login"|"cadastrar", identidade, senha }
// GET  /api/auth  (Authorization: Bearer <token>) -> confirma sessão
import {
  PERMITIDOS, resolveIdentidade, assinarToken, requerAdmin,
  hashSenha, verificaSenha, lerAdmins, salvarAdmins,
} from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const sub = requerAdmin(req);
    if (!sub) return res.status(401).json({ erro: true, mensagem: "Sessão inválida" });
    return res.status(200).json({ erro: false, identidade: sub });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ erro: true, mensagem: "Método não permitido" });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const acao = body.acao;
  const identidade = resolveIdentidade(body.identidade);
  const senha = String(body.senha || "");

  if (!identidade || !senha) {
    return res.status(400).json({ erro: true, mensagem: "Informe usuário/e-mail e senha." });
  }
  if (senha.length < 6) {
    return res.status(400).json({ erro: true, mensagem: "A senha deve ter ao menos 6 caracteres." });
  }

  let admins;
  try {
    admins = await lerAdmins();
  } catch (e) {
    return res.status(500).json({ erro: true, mensagem: "Falha ao ler admins: " + (e?.message || e) });
  }
  const existente = admins.find((a) => a.identidade === identidade);

  if (acao === "cadastrar") {
    if (!PERMITIDOS.map((x) => x.toLowerCase()).includes(identidade)) {
      return res.status(403).json({ erro: true, mensagem: "Esta identidade não está autorizada como administrador." });
    }
    if (existente) {
      return res.status(409).json({ erro: true, mensagem: "Conta já existe. Faça login." });
    }
    const { salt, hash } = hashSenha(senha);
    admins.push({ identidade, salt, hash, criadoEm: new Date().toISOString() });
    try {
      await salvarAdmins(admins);
    } catch (e) {
      if (e.code === "NO_BLOB") return res.status(500).json({ erro: true, mensagem: e.message });
      return res.status(500).json({ erro: true, mensagem: "Falha ao salvar: " + (e?.message || e) });
    }
    return res.status(200).json({ erro: false, token: assinarToken(identidade), identidade });
  }

  if (acao === "login") {
    if (!existente || !verificaSenha(senha, existente.salt, existente.hash)) {
      return res.status(401).json({ erro: true, mensagem: "Usuário ou senha inválidos." });
    }
    return res.status(200).json({ erro: false, token: assinarToken(identidade), identidade });
  }

  return res.status(400).json({ erro: true, mensagem: "Ação inválida." });
}
