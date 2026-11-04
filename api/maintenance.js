import { sql, requireUser, jsonOnly } from "./_lib.js";

// Registro de manutenção por câmera. GET ?id= (qualquer usuário); POST e DELETE ?id= (só editores).
// As linhas não dependem da câmera existir (sem chave estrangeira): trocar o ID de uma câmera deixa os registros no ID antigo.
export default async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    if (req.method === "GET") {
      const cam = String(req.query.id || "");
      if (!cam || cam.length > 100) return res.status(400).json({ error: "id inválido" });
      const rows = await sql`SELECT id::int AS id, done_on::text AS done_on, tecnico, descricao, created_by FROM maintenance WHERE camera_id = ${cam} ORDER BY done_on DESC, id DESC LIMIT 50`;
      return res.json({ items: rows });
    }
    if (req.method !== "POST" && req.method !== "DELETE") return res.status(405).end();
    if (user.role !== "edit") return res.status(403).json({ error: "Seu acesso é somente leitura." });
    if (req.method === "DELETE") {
      const id = Number(req.query.id);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "id inválido" });
      await sql`DELETE FROM maintenance WHERE id = ${id}`;
      return res.json({ ok: true });
    }
    if (!jsonOnly(req, res)) return;
    const { camera_id: cam, done_on: day, tecnico = "", descricao } = req.body || {};
    const okDay = typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) && Date.parse(day) <= Date.now() + 864e5;
    if (typeof cam !== "string" || !cam || cam.length > 100 || !okDay || typeof tecnico !== "string" || tecnico.length > 100 || typeof descricao !== "string" || !descricao.trim() || descricao.length > 500)
      return res.status(400).json({ error: "Informe a data (não futura) e a descrição do serviço." });
    const rows = await sql`INSERT INTO maintenance (camera_id, done_on, tecnico, descricao, created_by)
      SELECT ${cam}, ${day}::date, ${tecnico.trim()}, ${descricao.trim()}, ${user.email} WHERE EXISTS (SELECT 1 FROM cameras WHERE id = ${cam})
      RETURNING id::int AS id, done_on::text AS done_on, tecnico, descricao, created_by`;
    if (!rows.length) return res.status(404).json({ error: "Câmera não encontrada. Salve a câmera antes de registrar manutenção." });
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "erro no servidor" });
  }
}
