// Status público de uma máquina (para o cronômetro do cliente ao escanear o QR).
// GET ?m=<maquinaId> -> dados de exibição + sessão ativa (se houver). SEM auth.
// Lê o Blob privado com o token do servidor e devolve só o necessário (não o arquivo todo).
import { getMaquinas, getSessoes } from "../lib/data.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const m = req.query.m;
  if (!m) return res.status(400).json({ ok: false, mensagem: "Parâmetro m obrigatório." });
  try {
    const chave = String(m).trim().toLowerCase();
    const maquinas = await getMaquinas();
    // aceita id (compatibilidade) ou nome de exibição (case-insensitive)
    const maq = maquinas.find((x) => x.id === m)
      || maquinas.find((x) => String(x.nomeExibicao).trim().toLowerCase() === chave);
    if (!maq) return res.status(404).json({ ok: false, mensagem: "Máquina não encontrada." });
    const sessao = (await getSessoes()).find((s) => s.maquinaId === maq.id && s.status === "ativa") || null;
    return res.status(200).json({
      ok: true,
      maquina: { id: maq.id, nomeExibicao: maq.nomeExibicao, tipo: maq.tipo, duracaoMin: maq.duracaoMin },
      sessao: sessao ? { inicio: sessao.inicio, duracaoMin: sessao.duracaoMin, status: sessao.status } : null,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, mensagem: "Erro: " + (e?.message || e) });
  }
}
