import { sql, requireUser } from "./_lib.js";

const int = (v, min, max, dflt) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : dflt; };

// Quem alterou o quê numa câmera, da mais recente para a mais antiga. ?limit= (1–100, padrão 15), ?before= (id do último item já visto).
export default async function handler(req, res) {
  if (!requireUser(req, res)) return;
  if (req.method !== "GET") return res.status(405).end();
  const id = String(req.query.id || "");
  if (!id || id.length > 100) return res.status(400).json({ error: "id inválido" });
  const limit = int(req.query.limit, 1, 100, 15), before = int(req.query.before, 1, Number.MAX_SAFE_INTEGER, 0);
  try {
    const rows = await sql.query(
      `SELECT id::int AS id, at, user_email AS who, action, field, old_value, new_value FROM audit_log
       WHERE camera_id = $1 AND ($3::bigint = 0 OR id < $3::bigint) ORDER BY id DESC LIMIT $2::int + 1`, [id, limit, before]);
    res.json({ events: rows.slice(0, limit), more: rows.length > limit });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "erro no servidor" });
  }
}
