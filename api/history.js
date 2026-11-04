import { sql, requireUser } from "./_lib.js";

// Histórico de status de uma câmera + disponibilidade nos últimos 30 dias (online ou alerta / tempo instalada).
export default async function handler(req, res) {
  if (!requireUser(req, res)) return;
  if (req.method !== "GET") return res.status(405).end();
  const id = String(req.query.id || "");
  if (!id || id.length > 100) return res.status(400).json({ error: "id inválido" });
  try {
    const [events, [a]] = await sql.transaction([
      sql`SELECT status, motivo, changed_at AS at FROM status_history WHERE camera_id = ${id} ORDER BY changed_at DESC, id DESC LIMIT 30`,
      sql`WITH ev AS (
            SELECT status, changed_at AS s, COALESCE(LEAD(changed_at) OVER (ORDER BY changed_at, id), now()) AS e
            FROM status_history WHERE camera_id = ${id}),
          clip AS (SELECT status, GREATEST(s, now() - interval '30 days') AS s, e FROM ev WHERE e > now() - interval '30 days')
          SELECT sum(EXTRACT(EPOCH FROM e - s)) FILTER (WHERE status IN ('online', 'alerta')) AS up,
                 sum(EXTRACT(EPOCH FROM e - s)) FILTER (WHERE status <> 'planejada') AS total FROM clip`,
    ]);
    const total = Number(a?.total) || 0;
    res.json({ events, availability: total > 0 ? (Number(a.up) || 0) / total * 100 : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "erro no servidor" });
  }
}
