import { sql, requireUser } from "./_lib.js";

const int = (v, min, max, dflt) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : dflt; };

// Histórico de status de uma câmera: ?days= (0 = tudo, padrão 30), ?limit= (1–100, padrão 30), ?before= (id do último item já visto, para a próxima página).
// A disponibilidade (online ou alerta / tempo instalada) é do período e só vem na primeira página.
export default async function handler(req, res) {
  if (!requireUser(req, res)) return;
  if (req.method !== "GET") return res.status(405).end();
  const id = String(req.query.id || "");
  if (!id || id.length > 100) return res.status(400).json({ error: "id inválido" });
  const days = int(req.query.days, 0, 3650, 30), limit = int(req.query.limit, 1, 100, 30), before = int(req.query.before, 1, Number.MAX_SAFE_INTEGER, 0);
  try {
    const queries = [sql.query(
      `SELECT id::int AS id, status, motivo, changed_at AS at FROM status_history
       WHERE camera_id = $1 AND ($2::int = 0 OR changed_at > now() - $2::int * interval '1 day')
         AND ($3::bigint = 0 OR (changed_at, id) < (SELECT changed_at, id FROM status_history WHERE id = $3::bigint))
       ORDER BY changed_at DESC, id DESC LIMIT $4::int + 1`, [id, days, before, limit])];
    if (!before) queries.push(sql.query(
      `WITH w AS (SELECT CASE WHEN $2::int > 0 THEN now() - $2::int * interval '1 day' ELSE '-infinity'::timestamptz END AS ws),
        ev AS (SELECT status, changed_at AS s, COALESCE(LEAD(changed_at) OVER (ORDER BY changed_at, id), now()) AS e FROM status_history WHERE camera_id = $1),
        clip AS (SELECT status, GREATEST(s, w.ws) AS s, e FROM ev CROSS JOIN w WHERE e > w.ws)
       SELECT sum(EXTRACT(EPOCH FROM e - s)) FILTER (WHERE status IN ('online', 'alerta')) AS up,
              sum(EXTRACT(EPOCH FROM e - s)) FILTER (WHERE status <> 'planejada') AS total FROM clip`, [id, days]));
    const [rows, avail] = await sql.transaction(queries);
    const a = avail?.[0], total = Number(a?.total) || 0;
    res.json({ events: rows.slice(0, limit), more: rows.length > limit, availability: before ? null : total > 0 ? (Number(a.up) || 0) / total * 100 : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "erro no servidor" });
  }
}
