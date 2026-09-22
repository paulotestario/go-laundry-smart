// CRUD de filiais (JSON no Blob privado). Protegido por token de admin.
// GET -> lista | POST -> cria | PUT (?id=) -> atualiza | DELETE (?id=) -> exclui (cascata máquinas+sessões)
import { requerAdmin } from "../lib/auth.js";
import { getFiliais, setFiliais, getMaquinas, setMaquinas, getSessoes, setSessoes, uid } from "../lib/data.js";

function parseBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  return b || {};
}
const s = (v) => (v == null ? null : String(v).trim() || null);

export default async function handler(req, res) {
  if (!requerAdmin(req)) {
    res.setHeader("WWW-Authenticate", "Bearer");
    return res.status(401).json({ erro: true, mensagem: "Não autorizado" });
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      return res.status(200).json({ erro: false, filiais: await getFiliais() });
    }

    if (req.method === "POST") {
      const b = parseBody(req);
      if (!s(b.nome)) return res.status(400).json({ erro: true, mensagem: "Informe o nome da filial." });
      const filiais = await getFiliais();
      const nova = {
        id: uid(),
        nome: s(b.nome),
        cidade: s(b.cidade),
        endereco: s(b.endereco),
        telefone: s(b.telefone),
        criadoEm: new Date().toISOString(),
      };
      filiais.push(nova);
      await setFiliais(filiais);
      return res.status(200).json({ erro: false, filial: nova });
    }

    if (req.method === "PUT") {
      const id = req.query.id || parseBody(req).id;
      const b = parseBody(req);
      if (!id) return res.status(400).json({ erro: true, mensagem: "id obrigatório." });
      const filiais = await getFiliais();
      const f = filiais.find((x) => x.id === id);
      if (!f) return res.status(404).json({ erro: true, mensagem: "Filial não encontrada." });
      if (b.nome !== undefined) f.nome = s(b.nome) || f.nome;
      if (b.cidade !== undefined) f.cidade = s(b.cidade);
      if (b.endereco !== undefined) f.endereco = s(b.endereco);
      if (b.telefone !== undefined) f.telefone = s(b.telefone);
      await setFiliais(filiais);
      return res.status(200).json({ erro: false, filial: f });
    }

    if (req.method === "DELETE") {
      const id = req.query.id || parseBody(req).id;
      if (!id) return res.status(400).json({ erro: true, mensagem: "id obrigatório." });
      const filiais = await getFiliais();
      if (!filiais.some((x) => x.id === id)) return res.status(404).json({ erro: true, mensagem: "Filial não encontrada." });
      await setFiliais(filiais.filter((x) => x.id !== id));
      // cascata: máquinas da filial e sessões dessas máquinas
      const maquinas = await getMaquinas();
      const idsMaq = maquinas.filter((m) => m.filialId === id).map((m) => m.id);
      if (idsMaq.length) {
        await setMaquinas(maquinas.filter((m) => m.filialId !== id));
        const sessoes = await getSessoes();
        if (sessoes.some((se) => idsMaq.includes(se.maquinaId))) {
          await setSessoes(sessoes.filter((se) => !idsMaq.includes(se.maquinaId)));
        }
      }
      return res.status(200).json({ erro: false });
    }

    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return res.status(405).json({ erro: true, mensagem: "Método não permitido" });
  } catch (e) {
    return res.status(500).json({ erro: true, mensagem: e.code === "NO_BLOB" ? e.message : "Erro: " + (e?.message || e) });
  }
}
