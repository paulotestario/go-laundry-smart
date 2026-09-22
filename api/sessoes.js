// Sessões/ciclos (JSON no Blob privado). Protegido por token de admin.
// POST { maquinaId, acao:"iniciar"|"finalizar", duracaoMin? }
//   iniciar   -> cria sessão ativa (fecha qualquer ativa anterior da mesma máquina)
//   finalizar -> encerra a sessão ativa da máquina
import { requerAdmin } from "../lib/auth.js";
import { getMaquinas, getSessoes, setSessoes, uid } from "../lib/data.js";

function parseBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  return b || {};
}
const clampInt = (v, def) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 && n <= 600 ? n : def; };

export default async function handler(req, res) {
  if (!requerAdmin(req)) {
    res.setHeader("WWW-Authenticate", "Bearer");
    return res.status(401).json({ erro: true, mensagem: "Não autorizado" });
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      const sessoes = await getSessoes();
      return res.status(200).json({ erro: false, sessoes: sessoes.filter((s) => s.status === "ativa") });
    }

    if (req.method === "POST") {
      const b = parseBody(req);
      const maquinaId = b.maquinaId;
      const acao = b.acao;
      if (!maquinaId) return res.status(400).json({ erro: true, mensagem: "maquinaId obrigatório." });

      const sessoes = await getSessoes();

      if (acao === "iniciar") {
        // fecha ativa anterior da mesma máquina (garante 1 ativa por máquina)
        sessoes.forEach((s) => { if (s.maquinaId === maquinaId && s.status === "ativa") s.status = "finalizada"; });
        let dur = b.duracaoMin;
        if (!dur) {
          const maq = (await getMaquinas()).find((m) => m.id === maquinaId);
          dur = maq?.duracaoMin;
        }
        const nova = {
          id: uid(),
          maquinaId,
          inicio: new Date().toISOString(),
          duracaoMin: clampInt(dur, 50),
          status: "ativa",
          pagamentoId: b.pagamentoId || null,
        };
        sessoes.push(nova);
        await setSessoes(sessoes);
        return res.status(200).json({ erro: false, sessao: nova });
      }

      if (acao === "finalizar") {
        let mudou = false;
        sessoes.forEach((s) => { if (s.maquinaId === maquinaId && s.status === "ativa") { s.status = "finalizada"; mudou = true; } });
        if (mudou) await setSessoes(sessoes);
        return res.status(200).json({ erro: false });
      }

      return res.status(400).json({ erro: true, mensagem: "Ação inválida." });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ erro: true, mensagem: "Método não permitido" });
  } catch (e) {
    return res.status(500).json({ erro: true, mensagem: e.code === "NO_BLOB" ? e.message : "Erro: " + (e?.message || e) });
  }
}
