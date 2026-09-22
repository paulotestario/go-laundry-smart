// CRUD de máquinas (JSON no Blob privado). Protegido por token de admin.
// GET (?filialId=) -> lista | POST -> cria | PUT (?id=) -> atualiza | DELETE (?id=) -> exclui (cascata sessões)
import { requerAdmin } from "../lib/auth.js";
import { getMaquinas, setMaquinas, getSessoes, setSessoes, uid } from "../lib/data.js";

function parseBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  return b || {};
}
const s = (v) => (v == null ? null : String(v).trim() || null);
const clampInt = (v, def) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 && n <= 600 ? n : def; };

export default async function handler(req, res) {
  if (!requerAdmin(req)) {
    res.setHeader("WWW-Authenticate", "Bearer");
    return res.status(401).json({ erro: true, mensagem: "Não autorizado" });
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      let maquinas = await getMaquinas();
      const fil = req.query.filialId;
      if (fil) maquinas = maquinas.filter((m) => m.filialId === fil);
      // anexa sessão ativa de cada máquina
      const sessoes = await getSessoes();
      const ativas = {};
      sessoes.filter((se) => se.status === "ativa").forEach((se) => { ativas[se.maquinaId] = se; });
      maquinas = maquinas.map((m) => ({ ...m, sessaoAtiva: ativas[m.id] || null }));
      return res.status(200).json({ erro: false, maquinas });
    }

    if (req.method === "POST") {
      const b = parseBody(req);
      const nome = s(b.nomeExibicao);
      const tipo = b.tipo === "secadora" ? "secadora" : "lavadora";
      if (!nome) return res.status(400).json({ erro: true, mensagem: "Informe o nome/número da máquina." });
      if (!s(b.filialId)) return res.status(400).json({ erro: true, mensagem: "filialId obrigatório." });
      const maquinas = await getMaquinas();
      const nova = {
        id: uid(),
        filialId: s(b.filialId),
        idInterno: (tipo === "lavadora" ? "MAQ-" : "SEC-") + nome.toUpperCase(),
        nomeExibicao: nome,
        tipo,
        conjunto: b.conjunto ? parseInt(b.conjunto, 10) : null,
        duracaoMin: clampInt(b.duracaoMin, tipo === "secadora" ? 40 : 50),
      };
      maquinas.push(nova);
      await setMaquinas(maquinas);
      return res.status(200).json({ erro: false, maquina: nova });
    }

    if (req.method === "PUT") {
      const id = req.query.id || parseBody(req).id;
      const b = parseBody(req);
      if (!id) return res.status(400).json({ erro: true, mensagem: "id obrigatório." });
      const maquinas = await getMaquinas();
      const m = maquinas.find((x) => x.id === id);
      if (!m) return res.status(404).json({ erro: true, mensagem: "Máquina não encontrada." });
      if (b.nomeExibicao !== undefined && s(b.nomeExibicao)) m.nomeExibicao = s(b.nomeExibicao);
      if (b.tipo !== undefined) m.tipo = b.tipo === "secadora" ? "secadora" : "lavadora";
      if (b.conjunto !== undefined) m.conjunto = b.conjunto ? parseInt(b.conjunto, 10) : null;
      if (b.duracaoMin !== undefined) m.duracaoMin = clampInt(b.duracaoMin, m.duracaoMin);
      m.idInterno = (m.tipo === "lavadora" ? "MAQ-" : "SEC-") + String(m.nomeExibicao).toUpperCase();
      await setMaquinas(maquinas);
      return res.status(200).json({ erro: false, maquina: m });
    }

    if (req.method === "DELETE") {
      const id = req.query.id || parseBody(req).id;
      if (!id) return res.status(400).json({ erro: true, mensagem: "id obrigatório." });
      const maquinas = await getMaquinas();
      if (!maquinas.some((x) => x.id === id)) return res.status(404).json({ erro: true, mensagem: "Máquina não encontrada." });
      await setMaquinas(maquinas.filter((x) => x.id !== id));
      const sessoes = await getSessoes();
      if (sessoes.some((se) => se.maquinaId === id)) {
        await setSessoes(sessoes.filter((se) => se.maquinaId !== id));
      }
      return res.status(200).json({ erro: false });
    }

    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return res.status(405).json({ erro: true, mensagem: "Método não permitido" });
  } catch (e) {
    return res.status(500).json({ erro: true, mensagem: e.code === "NO_BLOB" ? e.message : "Erro: " + (e?.message || e) });
  }
}
